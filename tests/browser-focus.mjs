// Native marquee, explicit focus, saved-snapshot reads; model is scripted.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL;if(!url)throw new Error('Isolated profile URL required');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});let page;
try{
 const ctx=await browser.newContext({viewport:{width:1600,height:1000}});await ctx.addInitScript(installEditorInspection);page=await ctx.newPage();page.setDefaultTimeout(25000);const errors=[];let matched=false,advice=0;
 const client=await readFile('lib/client.js','utf8');page.on('response',async r=>{if(new URL(r.url()).pathname.startsWith('/plugins/')&&(await r.text().catch(()=>'')).includes(client))matched=true;});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/advice/generate'))advice++;});
 await prepareHost(page,url);assert(matched);await hostContext(page,'create',process.cwd());const input=page.locator('[contenteditable=true]'),button=page.getByRole('button',{name:'打开手绘参考板'});await input.fill('保留选区前输入');await button.click();let frame=await editorFrame(page);
 const ready=()=>frame.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});await ready();
 const call=(method,owner,payload)=>frame.evaluate(async args=>{const r=await fetch('/sketch-reference-rpc/v1/'+args.method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner:args.owner,payload:args.payload})});const b=await r.json();if(!b.ok)throw new Error(b.error.code);return b.value;},{method,owner,payload});
 const load=()=>call('drawing/get',null,{sessionId:new URL(frame.url()).searchParams.get('sessionId')});
 const stats=()=>page.evaluate(async()=>{const r=await fetch('/sketch-reference-test-agent-stats');return r.json();});
 await frame.evaluate(()=>{const base={x:100,y:100,width:100,height:80,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1};window.__sketchEditor().updateScene({elements:[{...base,id:'focus-r',type:'rectangle'},{...base,id:'focus-other',type:'ellipse',x:350}],captureUpdate:'NEVER'});});
 await frame.getByLabel('这张图准备用来做什么？').fill('局部协作');await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();const initial=await load();
 // Actual public selection tool, actual pointer marquee; no plugin geometry code.
 await frame.evaluate(()=>window.__sketchEditor().setActiveTool({type:'selection'}));const view=await frame.evaluate(()=>{const s=window.__sketchEditor().getAppState();return {x:s.scrollX,y:s.scrollY,zoom:s.zoom.value,left:s.offsetLeft,top:s.offsetTop};}),box=await page.locator('iframe[title="手绘参考板"]').boundingBox();
 const point=(x,y)=>({x:box.x+(x+view.x)*view.zoom+view.left,y:box.y+(y+view.y)*view.zoom+view.top});const start=point(80,80),end=point(230,220);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:10});await page.mouse.up();await frame.waitForFunction(()=>window.__sketchEditor().getAppState().selectedElementIds['focus-r']);
 assert(!(await frame.evaluate(()=>window.__sketchEditor().getAppState().selectedElementIds))['focus-other']);const before=(await stats()).calls.length;
 await frame.getByRole('button',{name:'更多操作',exact:true}).click();await frame.getByRole('button',{name:'选区作为重点',exact:true}).click();await frame.getByRole('alert').filter({hasText:'选区重点已设置'}).waitFor();assert.equal((await load()).drawing.revision,initial.drawing.revision);assert.equal((await stats()).calls.length,before);assert((await input.innerText()).includes('保留选区前输入'));
 const ask=async(task,answer)=>{const count=await page.getByText(answer,{exact:true}).count();await input.fill('SKETCH_AGENT_TEST '+task);await input.press('Enter');await page.getByText(answer,{exact:true}).nth(count).waitFor();};
 await ask('READ_FOCUS：只解释已设置的重点。','SKETCH_FOCUS_DONE：已读取 1 个重点元素，未创建批注或修改。');
 assert.equal((await call('agent/get',initial.owner,null)).batch,null);assert.equal((await call('proposal/get',initial.owner,null)).proposal,null);
 await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await ask('READ_FOCUS：画板关闭后继续读取重点。','SKETCH_FOCUS_DONE：已读取 1 个重点元素，未创建批注或修改。');
 await button.click();frame=await editorFrame(page);await ready();await frame.getByLabel('这张图准备用来做什么？').fill('修改后旧重点失效');await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();await ask('FOCUS_STATE：检查重点是否已过期。','SKETCH_FOCUS_STATE：stale');
 const stale=await load();await assert.rejects(call('agent/focus',initial.owner,{revision:initial.drawing.revision,elementIds:['focus-r']}),/REVISION_CONFLICT/);assert.equal((await load()).drawing.revision,stale.drawing.revision);
 await hostContext(page,'create',process.cwd());await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await ask('FOCUS_STATE：检查新会话。','SKETCH_FOCUS_STATE：none');
 await hostContext(page,'open',initial.owner.sessionId);
 await page.waitForFunction(id=>document.querySelector('iframe[title="手绘参考板"]')?.src.includes(encodeURIComponent(id)),initial.owner.sessionId);
 frame=await editorFrame(page);await ready();const calls=(await stats()).calls.length;
 await frame.getByRole('button',{name:'更多操作',exact:true}).click();await frame.getByRole('button',{name:'清除选区重点',exact:true}).click();await frame.getByRole('alert').filter({hasText:'选区重点已清除'}).waitFor();assert.equal((await stats()).calls.length,calls);assert.equal((await load()).drawing.revision,stale.drawing.revision);await ask('FOCUS_STATE：检查清除后的状态。','SKETCH_FOCUS_STATE：none');
 // Leave a valid ephemeral focus for the separate real-host restart check.
 await call('agent/focus',initial.owner,{revision:stale.drawing.revision,elementIds:['focus-r']});
 assert.equal(advice,0);assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/focus-session.json',JSON.stringify({owner:initial.owner,revision:stale.drawing.revision}));await writeFile('test-results/focus-native.json',JSON.stringify({realModel:false,calls:(await stats()).calls.slice(before),inputTokens:null,errors}));console.log('PASS: native pointer marquee and explicit focus without drawing/model writes, native focused tool read, closed-board continuation, stale version rejection, owner isolation and explicit clear. Scripted model only.');
}catch(e){if(page){await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/focus-failure.png'}).catch(()=>{});}throw e;}finally{await browser.close();}
