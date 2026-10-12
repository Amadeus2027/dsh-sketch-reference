// Same public UI/RPC on both releases. Isolated scripted models; no real keys.
// seed runs on v0.6.3; verify runs after plugin/host updates on the same profile.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL,mode=process.env.DSH_COMPAT_MODE??'directory';
const out=process.env.DSH_TEST_OUTPUT??'test-results/dsh-compatibility';
if(!url)throw Error('Dedicated authenticated no-credentials profile URL required');
if(!['seed','verify','directory'].includes(mode))throw Error('Unknown compatibility test mode');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
let page;
try{
 const storage=mode==='verify'?JSON.parse(await readFile(out+'/browser-state.json','utf8')):undefined;
 const context=await browser.newContext({viewport:{width:1600,height:1000},...(storage?{storageState:storage}:{})});await context.addInitScript(installEditorInspection);
 page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await prepareHost(page,url);
 const fixture=await page.evaluate(async()=>{const r=await fetch('/sketch-reference-test-agent-stats');if(!r.ok)throw Error('Dedicated scripted fixture required');return r.json();});
 assert.equal(fixture.scripted,true,'Never run this test with a real model profile');
 if(mode==='directory')assert.equal(fixture.directoryAvailable,true,'Directory test requires alpha.2');
 await hostContext(page,'theme','light');
 const saved=mode==='verify'?JSON.parse(await readFile(out+'/snapshot.json','utf8')):null;
 if(saved)await hostContext(page,'open',saved.owner.sessionId);else await hostContext(page,'create',process.cwd());
 const button=page.getByRole('button',{name:'打开手绘参考板'}),input=page.locator('[contenteditable=true]');await button.click();let frame=await editorFrame(page);
 await frame.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});
 const call=(method,owner,payload)=>frame.evaluate(async args=>{const r=await fetch('/sketch-reference-rpc/v1/'+args.method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner:args.owner,payload:args.payload})});const b=await r.json();if(!b.ok)throw Error(b.error.code);return b.value;},{method,owner,payload});
 const load=()=>call('drawing/get',null,{sessionId:new URL(frame.url()).searchParams.get('sessionId')});
 const capture=async()=>{const d=await load();return {owner:d.owner,drawing:d.drawing,latestAdvice:d.latestAdvice,agent:await call('agent/get',d.owner,null),proposal:await call('proposal/get',d.owner,null),visual:await call('visual/get',d.owner,null)};};
 const ask=async(task,answer)=>{const n=await page.getByText(answer,{exact:true}).count();await input.fill('SKETCH_AGENT_TEST '+task);await input.press('Enter');await page.getByText(answer,{exact:true}).nth(n).waitFor();};
 if(!saved){
  await frame.evaluate(()=>{const base={x:100,y:100,width:100,height:80,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1};window.__sketchEditor().updateScene({elements:[{...base,id:'compat-rect',type:'rectangle'},{...base,id:'compat-side',type:'ellipse',x:280}],captureUpdate:'NEVER'});});
  await frame.getByLabel('这张图准备用来做什么？').fill('双版本草图与批注恢复');await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();
  await frame.getByRole('button',{name:'AI 分析草图',exact:true}).click();await frame.getByRole('button',{name:'重新分析草图',exact:true}).waitFor();
  await ask('批注当前草图。','SKETCH_AGENT_DONE：模拟原生回答与批注已完成。');const record=await capture();
  const batch=record.agent.batch;assert(batch);await call('agent/update',record.owner,{batchId:batch.id,commentId:batch.comments[0].id,expectedRevision:batch.commentRevision,mutationId:crypto.randomUUID(),status:'resolved'});
  await ask('PROPOSE：先提出修改，等待确认。','SKETCH_EDIT_DONE：修改提议已保存，等待用户确认。');
  await frame.getByText('待预览',{exact:true}).waitFor();
 }
 if(mode==='seed'){
  const view={zoom:{value:.65},scrollX:37,scrollY:-89};await frame.evaluate(view=>window.__sketchEditor().updateScene({appState:view}),view);await page.waitForTimeout(1000);
  await input.fill('升级前未发送文字，应保持原样。');await frame.getByRole('button',{name:'返回聊天 ×',exact:true}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
  await button.click();await expect(page.locator('iframe[title="手绘参考板"]')).toHaveCount(1);
  const reopened=await editorFrame(page);await reopened.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});
  frame=reopened;const record=await capture();assert.equal(record.visual.all.stale,false);assert(record.proposal.proposal);
  await writeFile(out+'/snapshot.json',JSON.stringify({...record,view,input:await input.innerText()},null,2));await context.storageState({path:out+'/browser-state.json'});
  console.log('PASS seed: legacy draft, both comment batches, resolved status, pending edit, cached PNG, viewport and unsent text saved.');
 }else if(mode==='verify'){
  const actual=await capture();const {view,input:oldInput,...state}=saved;assert.deepEqual(actual,state);
  await expect.poll(()=>frame.evaluate(()=>{const s=window.__sketchEditor().getAppState();return {zoom:{value:s.zoom.value},scrollX:s.scrollX,scrollY:s.scrollY};})).toEqual(view);
  assert.equal(await input.innerText(),oldInput);
  const before=actual.drawing.revision;await hostContext(page,'theme','dark');await frame.waitForFunction(()=>window.__sketchEditor().getAppState().theme==='dark');await hostContext(page,'theme','light');await frame.waitForFunction(()=>window.__sketchEditor().getAppState().theme==='light');assert.equal((await load()).drawing.revision,before);
  await ask('READ_ONLY：读取升级后的草图。','SKETCH_AGENT_READ_DONE：当前已保存 2 个元素，未创建批注。');await ask('READ_VISUAL：读取升级后的缓存图片。','SKETCH_VISUAL_DONE：all 原生图片可见，未修改草图。');assert.deepEqual(await capture(),state);
  await writeFile(out+'/verified-'+(process.env.DSH_TEST_VERSION??'host')+'.json',JSON.stringify({draft:true,bothBatches:true,resolved:true,pendingProposal:true,cachedPng:true,viewport:true,unsentText:true,theme:true,closedVersionCompatible:true,realModel:false},null,2));
  console.log('PASS verify: unchanged legacy snapshot, owner/revision, both batches/status, proposal, PNG cache, viewport, draft text and native read.');
 }else{
  const before=await capture(),iframeUrl=frame.url(),worktree=join(process.cwd(),'test-results','compat-worktree');await mkdir(worktree,{recursive:true});
  await ask('CHANGE_DIRECTORY='+encodeURIComponent(worktree)+' READ_ONLY：切换执行目录后读取同一草图。','SKETCH_AGENT_READ_DONE：当前已保存 2 个元素，未创建批注。');
  const directory=await page.evaluate(async id=>(await (await fetch('/sketch-reference-test-agent-stats?sessionId='+encodeURIComponent(id))).json()).directory,before.owner.sessionId);
  assert.equal(directory.original,before.owner.cwd);assert.equal(directory.effective,worktree);assert.equal(frame.url(),iframeUrl);assert.deepEqual(await capture(),before);
  await frame.getByLabel('这张图准备用来做什么？').fill('目录变化后的保存');await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();const updated=await capture();assert.equal(updated.owner.cwd,before.owner.cwd);assert.notEqual(updated.drawing.revision,before.drawing.revision);assert.deepEqual(updated.drawing.scene,before.drawing.scene);
  await assert.rejects(call('drawing/save',before.owner,{expectedRevision:before.drawing.revision,mutationId:crypto.randomUUID(),scene:before.drawing.scene,goal:'旧保存不得覆盖'}),/REVISION_CONFLICT/);
  assert.equal((await load()).drawing.revision,updated.drawing.revision);await writeFile(out+'/directory.json',JSON.stringify({originalOwnerPreserved:true,directoryChanged:true,iframeRetained:true,dataPreserved:true,newSave:true,oldCasRejected:true,realModel:false},null,2));
  console.log('PASS directory: real native working_directory tool, same immutable owner/iframe/data, next save and stale-CAS protection.');
 }
 assert.deepEqual(errors,[]);
}catch(error){if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
