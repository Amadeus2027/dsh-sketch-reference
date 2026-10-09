// Explicit host restart / upgrade checks, using isolated profiles.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL,mode=process.env.DSH_PERSISTENCE_MODE;
assert(url&&['record-upgrade','verify-upgrade','verify-restart'].includes(mode));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addInitScript(installEditorInspection);
 const page=await context.newPage();page.setDefaultTimeout(20000);await prepareHost(page,url);
 const call=(method,owner,payload)=>page.evaluate(async({method,owner,payload})=>{
  const response=await fetch(`/sketch-reference-rpc/v1/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner,payload})});
  const result=await response.json();assertResult(result);return result.value;
  function assertResult(result){if(!result.ok)throw new Error(result.error.code);}
 },{method,owner,payload});
 if(mode==='record-upgrade'){
  const sessionId=await hostContext(page,'create',process.cwd());await page.getByRole('button',{name:'打开手绘参考板'}).click();const frame=await editorFrame(page);
  await frame.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});
  await frame.evaluate(()=>{const api=window.__sketchEditor();api.updateScene({elements:[{id:'upgrade-rect',type:'rectangle',x:100,y:100,width:180,height:100,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1}]});});
  await frame.getByLabel('这张图准备用来做什么？').fill('旧版升级保留草稿与建议');await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();
  await frame.getByRole('button',{name:'AI 分析草图',exact:true}).click();await frame.getByText('模拟布局建议：用于协议与界面测试',{exact:true}).waitFor();
  const loaded=await call('drawing/get',null,{sessionId});assert(loaded.drawing&&loaded.latestAdvice);
  await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
  await mkdir('test-results',{recursive:true});await writeFile('test-results/upgrade-session.json',JSON.stringify(loaded));
  console.log('PASS: recorded real 0.2.1 saved drawing and legacy advice for upgrade. Scripted model only.');
 }else if(mode==='verify-upgrade'){
  const previous=JSON.parse(await readFile('test-results/upgrade-session.json','utf8'));
  const loaded=await call('drawing/get',previous.owner,{sessionId:previous.owner.sessionId});
  assert.deepEqual(loaded.drawing,previous.drawing);assert.deepEqual(loaded.latestAdvice,previous.latestAdvice);
  assert.deepEqual(await call('agent/get',previous.owner,null),{available:true,batch:null});
  console.log('PASS: 0.2.1 -> 0.3.0 retained drawing and full legacy advice unchanged; additive Agent domain available and empty.');
 }else{
  const agent=JSON.parse(await readFile('test-results/agent-session.json','utf8'));
  const loaded=await call('drawing/get',agent.owner,{sessionId:agent.owner.sessionId});assert.equal(loaded.drawing.revision,agent.drawingRevision);
  const current=await call('agent/get',agent.owner,null);assert.equal(current.available,true);assert.deepEqual(current.batch,agent.batch);
  const comments=JSON.parse(await readFile('test-results/comments-session.json','utf8'));
  const legacy=await call('drawing/get',comments.owner,{sessionId:comments.owner.sessionId});
  assert.equal(legacy.drawing.revision,comments.drawingRevision);assert.equal(legacy.drawing.contentDigest,comments.contentDigest);
  assert.equal(legacy.latestAdvice.id,comments.batchId);assert.equal(legacy.latestAdvice.commentRevision,comments.commentRevision);assert.deepEqual(legacy.latestAdvice.comments,comments.comments);
  console.log('PASS: after host restart, drawing revisions, full Agent batch/statuses and legacy batch/statuses restored from actual DSH storage.');
  if(process.env.DSH_EDITS_PERSISTENCE==='1'){
   const edits=JSON.parse(await readFile('test-results/edits-session.json','utf8'));
   const current=await call('drawing/get',edits.owner,{sessionId:edits.owner.sessionId});
   assert.deepEqual(current.drawing,edits.drawing);assert.deepEqual((await call('proposal/get',edits.owner,null)).proposal,edits.proposal);
   const focus=JSON.parse(await readFile('test-results/focus-session.json','utf8'));
   assert.equal((await call('drawing/get',focus.owner,{sessionId:focus.owner.sessionId})).drawing.revision,focus.revision);
   await hostContext(page,'open',focus.owner.sessionId);
   const answer='SKETCH_FOCUS_STATE：none',count=await page.getByText(answer,{exact:true}).count(),input=page.locator('[contenteditable=true]');
   await input.fill('SKETCH_AGENT_TEST FOCUS_STATE：检查宿主重启后的重点。');await input.press('Enter');await page.getByText(answer,{exact:true}).nth(count).waitFor();
   console.log('PASS: after real host restart, edit proposal/full recovery snapshot and drawing persist; ephemeral selection focus clears and native read confirms none. Scripted model.');
  }
 }
}finally{await browser.close();}
