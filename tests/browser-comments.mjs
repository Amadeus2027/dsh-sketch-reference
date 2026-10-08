// Real DSH + real Excalidraw; the model is replaced by mock-model.overlay.yml.
// No real model calls. Use a fresh dedicated profile and the test overlay only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.DSH_SMOKE_URL;
if(!url)throw new Error('Set DSH_SMOKE_URL for a dedicated DSH profile with mock-model.overlay.yml.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('test-results',{recursive:true});
let diagnosticPage,diagnosticBaseline;const modelEvents=[],started=Date.now();
try{
 const context=await browser.newContext({viewport:{width:1600,height:1050}}),page=await context.newPage();page.setDefaultTimeout(15000);
 diagnosticPage=page;
 const errors=[];let analysisCalls=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/advice/generate')){analysisCalls++;modelEvents.push({type:'request',ms:Date.now()-started});}});
 page.on('response',async r=>{if(r.url().endsWith('/advice/generate')){const value=await r.json().catch(()=>null);modelEvents.push({type:'response',ms:Date.now()-started,status:r.status(),error:value?.error?.code});}});
 // Inspect the fixed React 18 fixture's hook state for the public Excalidraw API.
 // This is test-only; no API or globals are exposed by the production editor.
 await context.addInitScript(()=>{
  window.__sketchEditor=()=>{
   const node=document.querySelector('main.board');if(!node)throw new Error('Board not mounted');
   let fiber=node[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];
   for(;fiber;fiber=fiber.return)for(let hook=fiber.memoizedState;hook;hook=hook.next){const value=hook.memoizedState;if(value?.getSceneElements&&value?.updateScene)return value;}
   throw new Error('Excalidraw API hook not found');
  };
 });
 await page.goto(url);
 const modelStats=()=>page.evaluate(async()=>{const response=await fetch('/sketch-reference-test-model-stats');if(!response.ok)throw new Error('Mock fixture stats unavailable');return response.json();});
 const streamBaseline=(await modelStats()).calls.length;
 for(let round=0;round<5;round++){
  await page.waitForTimeout(500);
  for(const name of ['Continue','Configure later']){const b=page.getByRole('button',{name,exact:true});if(await b.isVisible().catch(()=>false)){await b.click();await page.waitForTimeout(500);}}
 }
 const chooseWorkspace=async()=>{
  const choose=page.getByRole('button',{name:'Choose workspace',exact:true});
  if(await choose.isVisible()){
   await choose.click();const existing=page.getByRole('menuitem',{name:'dsh-sketch-reference',exact:true});
   if(await existing.isVisible())await existing.click();
   else{await page.getByRole('button',{name:'Edit path',exact:true}).click();const path=page.getByRole('textbox',{name:'Edit path',exact:true});await path.fill(process.cwd());await path.press('Enter');await page.getByRole('button',{name:'Open',exact:true}).click();}
  }
 };
 await chooseWorkspace();
 const input=page.locator('[contenteditable=true]');
 await page.getByRole('button',{name:'打开手绘参考板'}).click();let frame=page.frameLocator('iframe[title="手绘参考板"]');
 const freshSession=async()=>{
  // DSH intentionally reuses blank sessions for its New session button. Use its
  // fixed-version client service to create a truly isolated test session.
  await page.evaluate(async()=>{
   const node=document.querySelector('iframe[title="手绘参考板"]');let fiber=node[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))],ctx;
   for(;fiber;fiber=fiber.return){if(fiber.memoizedProps?.ctx){ctx=fiber.memoizedProps.ctx;break;}}
   if(!ctx)throw new Error('Fixture host context unavailable');
   const navigation=ctx.get('uiWorkspace'),workspace=navigation.workspaces.list.getSnapshot().items.find(w=>w.path===window.__sketchTestPath);
   if(!workspace)throw new Error('Fixture workspace unavailable');
   const id=await navigation.sessions.create({workspaceId:workspace.workspaceId});navigation.openSession(id);
  }).catch(error=>{if(!error.message.includes('Execution context was destroyed'))throw error;}); // DSH navigation may replace the page context.
  await page.evaluate(path=>{window.__sketchTestPath=path;},process.cwd());
  await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=page.frameLocator('iframe[title="手绘参考板"]');await frame.getByLabel('这张图准备用来做什么？').waitFor();
 };
 await page.evaluate(path=>{window.__sketchTestPath=path;},process.cwd());await freshSession();await input.fill('保留原有任务。');
 const child=async()=>await (await page.locator('iframe[title="手绘参考板"]').elementHandle()).contentFrame();
 const call=async(method,owner,payload)=>(await (await child()).evaluate(async({method,owner,payload})=>{
  return (await fetch('/sketch-reference-rpc/v1/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner,payload})})).json();
 },{method,owner,payload}));
 const load=async()=>{
  const sessionId=await (await child()).evaluate(()=>new URLSearchParams(location.search).get('sessionId'));
  const result=await call('drawing/get',null,{sessionId});assert(result.ok);return result.value;
 };
 const saved=()=>frame.getByRole('status').filter({hasText:'已保存'}).waitFor();
 const card=()=>frame.locator('.commentCard').first();
 const marker=()=>frame.getByRole('button',{name:'批注①',exact:true});
 const position=async()=>await marker().evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 const snapshot=async()=>await (await child()).evaluate(()=>{const api=window.__sketchEditor(),s=api.getAppState();return {elements:api.getSceneElements(),scrollX:s.scrollX,scrollY:s.scrollY,zoom:s.zoom.value,offsetLeft:s.offsetLeft,offsetTop:s.offsetTop,actualTop:document.querySelector('.excalidraw').getBoundingClientRect().top};});
 const closePopup=async()=>{const button=frame.getByRole('button',{name:'收起批注'});if(await button.isVisible())await button.click();};
 await frame.getByLabel('这张图准备用来做什么？').fill('网页首页布局');
 const box=await frame.locator('.excalidraw').boundingBox();assert(box);
 await frame.locator('.excalidraw').click();await page.keyboard.press('r');
 await page.mouse.move(box.x+260,box.y+160);await page.mouse.down();await page.mouse.move(box.x+510,box.y+240,{steps:8});await page.mouse.up();await page.waitForTimeout(100);await saved();
 const initial=await load();diagnosticBaseline=initial.drawing;assert.equal(initial.latestAdvice,null);assert.equal(analysisCalls,0);
 const pngBefore=page.waitForEvent('download');await frame.getByRole('button',{name:'更多操作',exact:true}).click();await frame.getByRole('button',{name:'导出 PNG',exact:true}).click();await pngBefore;
 console.log('analyzing with the mock DSH stream');
 await frame.getByRole('button',{name:'AI 分析草图',exact:true}).click();await frame.getByText('模拟布局建议：用于协议与界面测试',{exact:true}).waitFor();await frame.getByRole('button',{name:'展开建议与批注',exact:true}).click();
 await marker().waitFor();let loaded=await load(),batch=loaded.latestAdvice;const targetId=batch.advice.suggestions[0].anchor.elementId;
 assert.equal(batch.analysisRevision,loaded.drawing.revision);assert.equal(batch.comments.length,3);assert.equal(batch.advice.suggestions[1].anchor,undefined);assert.equal(batch.advice.suggestions[2].anchor,undefined);
 assert.equal(analysisCalls,1);assert.equal((await snapshot()).elements.length,initial.drawing.scene.elements.length);
 await closePopup();await marker().click();await frame.getByRole('dialog',{name:'批注详情①'}).waitFor();
 await closePopup();await card().getByRole('button',{name:'① 增加导航留白',exact:true}).click();
 assert.equal((await (await child()).evaluate(()=>window.__sketchEditor().getAppState().selectedElementIds))[targetId],true);
 await card().getByRole('button',{name:'使用建议',exact:true}).click();await frame.getByRole('alert').filter({hasText:'建议已加入输入框'}).waitFor();assert((await input.innerText()).includes(batch.advice.suggestions[0].actionPrompt));assert((await input.innerText()).includes('保留原有任务。'));
 await card().getByRole('button',{name:'查看指令',exact:true}).click();assert.equal(await frame.getByLabel('建议指令').inputValue(),batch.advice.suggestions[0].actionPrompt);await frame.getByRole('button',{name:'收起',exact:true}).click();
 await frame.locator('.commentCard').nth(1).getByRole('button',{name:'② 统一卡片间距',exact:true}).click();await frame.locator('.commentCard').nth(1).getByText('保持布局节奏一致。',{exact:true}).waitFor();
 await card().getByRole('button',{name:'① 增加导航留白',exact:true}).click();
 await card().getByRole('button',{name:'标记已解决',exact:true}).click();await card().filter({has:frame.getByText('已解决 · 元素批注',{exact:true})}).waitFor();
 loaded=await load();assert.equal(loaded.drawing.revision,initial.drawing.revision);assert.equal(loaded.drawing.contentDigest,initial.drawing.contentDigest);assert.equal(analysisCalls,1);
 console.log('restoring resolved state and exercising CAS conflict');
 await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
 await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=page.frameLocator('iframe[title="手绘参考板"]');await frame.getByRole('button',{name:'展开建议与批注',exact:true}).click();await frame.getByText('已解决 · 元素批注',{exact:true}).waitFor();
 await card().getByRole('button',{name:'① 增加导航留白',exact:true}).click();await card().getByRole('button',{name:'重新打开',exact:true}).click();await frame.getByText('元素批注',{exact:true}).waitFor();
 loaded=await load();batch=loaded.latestAdvice;
 const foreign={batchId:batch.id,expectedRevision:batch.commentRevision,mutationId:crypto.randomUUID(),commentId:batch.comments[0].id,status:'resolved'};
 assert((await call('advice/update',loaded.owner,foreign)).ok);
 assert.equal((await call('advice/update',loaded.owner,{...foreign,mutationId:crypto.randomUUID(),status:'ignored'})).error.code,'COMMENT_CONFLICT');
 await card().getByRole('button',{name:'忽略批注',exact:true}).click();await frame.getByRole('alert').filter({hasText:'另一窗口已修改批注'}).waitFor();
 await frame.locator('.notice').getByRole('button',{name:'刷新批注',exact:true}).click();await frame.getByText('已解决 · 元素批注',{exact:true}).waitFor();
 await card().getByRole('button',{name:'① 增加导航留白',exact:true}).click();await card().getByRole('button',{name:'忽略批注',exact:true}).click();await frame.getByRole('button',{name:'显示已忽略',exact:true}).waitFor();await marker().waitFor({state:'detached'});
 await frame.getByRole('button',{name:'显示已忽略',exact:true}).click();await card().getByRole('button',{name:'① 增加导航留白',exact:true}).click();await card().getByRole('button',{name:'重新打开',exact:true}).click();await marker().waitFor();
 await frame.getByRole('button',{name:'隐藏批注',exact:true}).click();assert.equal(await marker().isVisible(),false);await frame.getByRole('button',{name:'显示批注',exact:true}).click();await marker().waitFor();assert.equal(analysisCalls,1);
 await closePopup();
 console.log('following pan, zoom, movement, resize and deletion');
 const approx=(a,b)=>assert(Math.abs(a-b)<2,`${a} != ${b}`);
 let before=await position(),state=await snapshot();
 await (await child()).evaluate(()=>{const api=window.__sketchEditor(),s=api.getAppState();api.updateScene({appState:{scrollX:s.scrollX+35,scrollY:s.scrollY-20}});});
 await page.waitForTimeout(150);let after=await position();approx(after.x-before.x,35*state.zoom);approx(after.y-before.y,-20*state.zoom);
 await (await child()).evaluate(()=>window.__sketchEditor().updateScene({appState:{zoom:{value:0.75}}}));await page.waitForTimeout(150);
 state=await snapshot();let target=state.elements.find(e=>e.id===targetId);after=await position();approx(after.x,(target.x+target.width+state.scrollX)*state.zoom+state.offsetLeft);approx(after.y,(target.y+state.scrollY)*state.zoom+state.offsetTop);
 // Real pointer dragging; viewport changes alone did not save the scene.
 assert.equal((await load()).drawing.revision,initial.drawing.revision);
 await (await child()).evaluate(id=>{const api=window.__sketchEditor();api.setActiveTool({type:'selection'});api.updateScene({appState:{selectedElementIds:{[id]:true}},captureUpdate:'NEVER'});},targetId);
 const iframeBox=await page.locator('iframe[title="手绘参考板"]').boundingBox(),px=iframeBox.x+(target.x+target.width/4+state.scrollX)*state.zoom+state.offsetLeft,py=iframeBox.y+(target.y+state.scrollY)*state.zoom+state.offsetTop;
 before=await position();await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+30,py+15,{steps:10});await page.mouse.up();await page.waitForTimeout(150);after=await position();approx(after.x-before.x,30);approx(after.y-before.y,15);
 approx((await snapshot()).elements.find(e=>e.id===targetId).x,target.x+30/state.zoom);
 await frame.getByText('较早版本的元素批注',{exact:true}).waitFor();assert.equal(await card().getByRole('button',{name:'使用建议',exact:true}).count(),0);assert.equal(analysisCalls,1);
 before=await position();
 await (await child()).evaluate(id=>{const api=window.__sketchEditor();api.updateScene({elements:api.getSceneElements().map(e=>e.id===id?{...e,width:e.width+40,version:e.version+1}:e),captureUpdate:'IMMEDIATELY'});},targetId);
 await page.waitForTimeout(150);after=await position();approx(after.x-before.x,40*state.zoom);await saved();
 await page.setViewportSize({width:1400,height:950});await page.waitForTimeout(200);state=await snapshot();target=state.elements.find(e=>e.id===targetId);after=await position();approx(after.x,(target.x+target.width+state.scrollX)*state.zoom+state.offsetLeft);approx(after.y,(target.y+state.scrollY)*state.zoom+state.offsetTop);
 await frame.locator('canvas.interactive').focus();await page.keyboard.press('Delete');await frame.getByText('失去锚点',{exact:true}).waitFor();await marker().waitFor({state:'detached'});assert.equal(analysisCalls,1);
 await page.keyboard.press('Control+z');await marker().waitFor();await saved();
 await page.screenshot({path:'test-results/anchored-comments.png'});
 // Reloading also recomputes stale state, rather than re-enabling old instructions.
 await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=page.frameLocator('iframe[title="手绘参考板"]');await frame.getByRole('button',{name:'展开建议与批注',exact:true}).click();await frame.getByText('较早版本的元素批注',{exact:true}).waitFor();
 const identity=(await load()).owner;
 assert.equal((await call('advice/get',{...identity,createdAt:'wrong-lifecycle'},null)).error.code,'SESSION_CHANGED');
 const oldBatch=(await load()).latestAdvice.id;
 console.log('rejecting invalid JSON, cancellation and deadline without damaging drafts');
 await frame.getByLabel('这张图准备用来做什么？').fill('格式错误测试');await saved();await frame.getByRole('button',{name:'重新分析草图',exact:true}).click();await frame.getByRole('alert').filter({hasText:'格式不完整'}).waitFor();assert.equal((await load()).latestAdvice.id,oldBatch);
 await frame.getByLabel('这张图准备用来做什么？').fill('慢请求取消测试');await saved();const requesting=page.waitForRequest(r=>r.url().endsWith('/advice/generate'));await frame.getByRole('button',{name:'重新分析草图',exact:true}).click();
 await requesting;await page.waitForTimeout(150);await frame.getByRole('button',{name:'取消',exact:true}).click();await frame.getByRole('alert').filter({hasText:'分析已取消'}).waitFor();assert.equal((await load()).latestAdvice.id,oldBatch);
 await page.waitForTimeout(150);
 await frame.getByLabel('这张图准备用来做什么？').fill('慢请求超时测试');await saved();await frame.getByRole('button',{name:'重新分析草图',exact:true}).click();await frame.getByRole('alert').filter({hasText:'DS 分析超时'}).waitFor({timeout:30000});
 await page.waitForTimeout(150);state=await snapshot();approx(state.offsetTop,state.actualTop);
 loaded=await load();assert.equal(loaded.latestAdvice.id,oldBatch);assert.equal(loaded.drawing.goal,'慢请求超时测试');assert(loaded.drawing.scene.elements.length>0);assert.equal(analysisCalls,4);
 assert.equal(modelEvents.filter(e=>e.type==='response').at(-1).status,504);
 // Failed analysis must leave the native reference workflow usable.
 const exported=page.waitForEvent('download');await frame.getByRole('button',{name:'更多操作',exact:true}).click();await frame.getByRole('button',{name:'导出 PNG',exact:true}).click();await exported;
 await frame.getByRole('button',{name:'作为参考发送',exact:true}).click();await frame.getByRole('alert').filter({hasText:'参考图已加入左侧输入框'}).waitFor();
 assert((await input.innerText()).includes('保留原有任务。'));await page.getByRole('img',{name:'sketch-reference.png',exact:true}).first().waitFor();
 const streamCalls=(await modelStats()).calls.slice(streamBaseline);assert.equal(streamCalls.length,4);
 assert.deepEqual(streamCalls.map(c=>c.goal),['网页首页布局','格式错误测试','慢请求取消测试','慢请求超时测试']);
 await frame.getByLabel('这张图准备用来做什么？').fill('慢请求关闭测试');await saved();const closingRequest=page.waitForRequest(r=>r.url().endsWith('/advice/generate'));await frame.getByRole('button',{name:'重新分析草图',exact:true}).click();await closingRequest;await page.waitForTimeout(150);await page.getByRole('button',{name:'打开手绘参考板'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await page.waitForTimeout(150);assert.equal((await modelStats()).calls.at(-1).aborted,true);await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=page.frameLocator('iframe[title="手绘参考板"]');await frame.getByLabel('这张图准备用来做什么？').waitFor();assert.equal((await load()).latestAdvice.id,oldBatch);assert.equal(analysisCalls,5);
 const persisted=await load();
 await writeFile('test-results/comments-session.json',JSON.stringify({owner:persisted.owner,batchId:persisted.latestAdvice.id,commentRevision:persisted.latestAdvice.commentRevision,comments:persisted.latestAdvice.comments,drawingRevision:persisted.drawing.revision,contentDigest:persisted.drawing.contentDigest}));
 await freshSession();
 const other=await load();assert.notEqual(other.owner.sessionId,identity.sessionId);assert.equal(other.latestAdvice,null);assert.equal(await frame.locator('.commentCard').count(),0);assert.equal(analysisCalls,5);
 assert.equal((await call('advice/get',identity,null)).value.id,oldBatch);
 assert.deepEqual(errors,[]);
 console.log('PASS: mock anchored analysis, global fallback, popup/list highlight, native instruction insertion, persisted resolve/reopen/ignore, comment CAS, hide/show, native drag/undo, pan/zoom/resize tracking, removed anchor, stale reload, lifecycle isolation, invalid JSON/cancel/timeout, export/native reference after failed analysis, exactly one stream per explicit analysis. No real DS effects tested.');
}catch(error){
 console.log('Fixture model events:',modelEvents);
 if(diagnosticPage){await diagnosticPage.screenshot({path:'test-results/comments-failure.png'}).catch(()=>{});const child=diagnosticPage.frames().find(f=>f.url().includes('/sketch-reference-assets/'));if(child){console.log('Fixture failure state:',await child.evaluate(()=>({labels:[...document.querySelectorAll('.commentCard small')].map(n=>n.textContent),alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent)})).catch(()=>null));
  if(diagnosticBaseline){const current=await child.evaluate(()=>{const api=window.__sketchEditor(),s=api.getAppState();return {elements:api.getSceneElements(),appState:Object.fromEntries(['viewBackgroundColor','gridSize','gridStep','gridModeEnabled'].map(k=>[k,s[k]]))};}).catch(()=>null);if(current){const changes=[];for(const old of diagnosticBaseline.scene.elements){const next=current.elements.find(e=>e.id===old.id);if(next)for(const key of new Set([...Object.keys(old),...Object.keys(next)]))if(JSON.stringify(old[key])!==JSON.stringify(next[key]))changes.push({key,before:old[key],after:next[key]});}console.log('Fixture element delta:',changes);console.log('Fixture appState delta:',{before:diagnosticBaseline.scene.appState,after:current.appState});}}
 }}
 throw error;
}finally{await browser.close();}
