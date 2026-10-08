// Real installed DSH + Chromium; no real model requests. Isolated test profile only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL;if(!url)throw new Error('Dedicated DSH URL required');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
let page;
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});await context.addInitScript(installEditorInspection);
 // The toolbar-close regression must work without the local recovery safety net.
 await context.addInitScript(()=>{const storage=window.localStorage;Object.defineProperty(window,'localStorage',{get(){if(location.pathname.startsWith('/sketch-reference-assets/'))throw new DOMException('Blocked test storage','SecurityError');return storage;}});});
 page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];let modelCalls=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/advice/generate'))modelCalls++;});
 await prepareHost(page,url);await hostContext(page,'create',process.cwd());
 const button=page.getByRole('button',{name:'打开手绘参考板'}),input=page.locator('[contenteditable=true]');await input.fill('原生化验收：保留输入与光标。');
 const originalInput=await input.elementHandle();
 await button.click();let frame=await editorFrame(page);
 const ready=async()=>frame.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});await ready();
 const call=async(method,owner,payload)=>page.evaluate(async({method,owner,payload})=>{
  const r=await fetch('/sketch-reference-rpc/v1/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner,payload})});const result=await r.json();if(!result.ok)throw new Error(result.error.message);return result.value;
 },{method,owner,payload});
 const load=async()=>call('drawing/get',null,{sessionId:new URL(frame.url()).searchParams.get('sessionId')});
 await frame.getByLabel('这张图准备用来做什么？').fill('快速关闭仍保存');
 // Less than the 800ms autosave debounce: the native toolbar must ask the editor to settle.
 await button.click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
 assert(await originalInput.evaluate(node=>node===document.querySelector('[contenteditable=true]')));assert.equal(await input.innerText(),'原生化验收：保留输入与光标。');
 await button.click();frame=await editorFrame(page);await ready();assert.equal(await frame.getByLabel('这张图准备用来做什么？').inputValue(),'快速关闭仍保存');
 await frame.evaluate(()=>window.__sketchEditor().updateScene({elements:[{id:'native-test',type:'rectangle',x:80,y:120,width:200,height:100,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1}]}));await page.waitForTimeout(1000);await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();
 const before=await load();
 for(const theme of ['dark','light']){
  const document=frame;await hostContext(page,'theme',theme);await frame.waitForFunction(theme=>window.__sketchEditor().getAppState().theme===theme,theme);
  assert.equal(frame,document);assert.equal((await load()).drawing.revision,before.drawing.revision);assert.equal(await page.locator('iframe[title="手绘参考板"]').count(),1);
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/native-${theme}.png`});
 }
 // Reloading the isolated editor creates a fresh MessageChannel, then closes normally.
 await frame.evaluate(()=>location.reload());frame=await editorFrame(page);await ready();await button.click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
 for(let i=0;i<3;i++){await button.click();frame=await editorFrame(page);await ready();await button.click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});assert.equal(await button.count(),1);}
 await button.click();frame=await editorFrame(page);await ready();const first=(await load()).owner;
 await frame.getByLabel('这张图准备用来做什么？').fill('切换前最后一次编辑');
 await hostContext(page,'create',process.cwd());await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await button.click();frame=await editorFrame(page);await ready();
 const second=await load();assert.notEqual(second.owner.sessionId,first.sessionId);assert.equal(second.drawing,null);assert.equal(second.latestAdvice,null);
 // The old owner can only be loaded by the matching lifecycle; no write to the new session.
 await page.waitForTimeout(300);const previous=await call('drawing/get',first,{sessionId:first.sessionId});assert.equal(previous.drawing.goal,'切换前最后一次编辑');
 await hostContext(page,'open',first.sessionId);frame=await editorFrame(page);await ready();assert.equal(await frame.getByLabel('这张图准备用来做什么？').inputValue(),'切换前最后一次编辑');assert((await input.innerText()).includes('原生化验收'));
 await hostContext(page,'createAt','/tmp/sketch-reference-native-workspace-test');await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});await button.click();frame=await editorFrame(page);await ready();const foreign=await load();assert.equal(foreign.owner.cwd,'/tmp/sketch-reference-native-workspace-test');assert.equal(foreign.drawing,null);assert.equal(foreign.latestAdvice,null);
 await hostContext(page,'open',first.sessionId);frame=await editorFrame(page);await ready();
 await page.setViewportSize({width:900,height:700});await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
 assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
 console.log('PASS: installed DSH toolbar save-before-close with blocked storage, stable native composer, live themes without revision changes/reload, fresh bridge after iframe reload, repeated open/close, latest edit on session switch, session isolation, narrow-screen close; zero AI calls.');
}catch(error){if(page){await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/native-failure.png'}).catch(()=>{});}throw error;}finally{await browser.close();}
