// No AI requests. Real DSH, real Chromium and real Excalidraw measurements.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL;if(!url)throw new Error('Dedicated local DSH URL required');
const label=process.env.DSH_PERF_LABEL??'current';if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid label');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
const report={label,date:new Date().toISOString(),viewport:{width:1600,height:1000},sceneElements:250,framesPerGesture:50,realModelCalls:0,saveRequestMs:[],measurements:[]};
try{
 const context=await browser.newContext({viewport:report.viewport,acceptDownloads:true});await context.addInitScript(installEditorInspection);const page=await context.newPage();page.setDefaultTimeout(20000);
 const expectedClient=await readFile(process.env.DSH_PERF_CLIENT??'lib/client.js','utf8');let clientVerified=false;page.on('response',async response=>{if(new URL(response.url()).pathname.startsWith('/plugins/')){const source=await response.text().catch(()=>null);if(source?.includes(expectedClient))clientVerified=true;}});
 const saveStarted=new Map();page.on('response',response=>{const start=saveStarted.get(response.request());if(start!==undefined&&response.status()===200)report.saveRequestMs.push(performance.now()-start);});
 let editorRequests=0,saveCalls=0,modelCalls=0;page.on('request',r=>{if(r.url().includes('/sketch-reference-assets/'))editorRequests++;if(r.url().endsWith('/drawing/save')){saveCalls++;saveStarted.set(r,performance.now());}if(r.url().endsWith('/advice/generate'))modelCalls++;});
 await prepareHost(page,url);await hostContext(page,'create',process.cwd()).catch(e=>{if(!e.message.includes('Execution context was destroyed'))throw e;});await page.getByRole('button',{name:'打开手绘参考板'}).waitFor();
 assert(clientVerified,'Browser client must match the installed artifact');report.clientArtifactVerified=true;
 report.editorRequestsBeforeOpen=editorRequests;assert.equal(editorRequests,0);
 const input=page.locator('[contenteditable=true]');await input.fill('性能测试保留输入');
 let started=performance.now();await page.getByRole('button',{name:'打开手绘参考板'}).click();let frame=await editorFrame(page);
 await frame.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 report.firstOpenMs=performance.now()-started;report.editorRequestsAfterOpen=editorRequests;
 const area=await frame.evaluate(()=>{const r=document.querySelector('.canvas').getBoundingClientRect();return {width:r.width,height:r.height,viewportHeight:innerHeight};});report.canvas=area;
 // Fixed valid Excalidraw elements; seeded identically in both installed versions.
 await frame.evaluate(()=>{const api=window.__sketchEditor(),base={type:'rectangle',angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false};api.updateScene({elements:Array.from({length:250},(_,i)=>({...base,id:'perf-'+i,x:(i%15)*75,y:Math.floor(i/15)*55,width:60,height:40,version:1,versionNonce:i+1}))});});
 await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();await page.waitForTimeout(1000);
 for(const gesture of ['pan','edit']){
  const saves=saveCalls;
  const result=await frame.evaluate(async gesture=>{
   const api=window.__sketchEditor(),initial={...window.__sketchMetrics,longTasks:[...window.__sketchMetrics.longTasks]},start=performance.now(),gaps=[];let prior=start;
   for(let i=0;i<50;i++){
    await new Promise(r=>requestAnimationFrame(r));const now=performance.now();gaps.push(now-prior);prior=now;
    if(gesture==='pan')api.updateScene({appState:{scrollX:api.getAppState().scrollX+1}});
    else{const elements=api.getSceneElements();api.updateScene({elements:elements.map((e,j)=>j?e:{...e,x:e.x+1,version:e.version+1,versionNonce:e.versionNonce+1})});}
   }
   await new Promise(r=>setTimeout(r,150));const elapsedMs=performance.now()-start;
   return {gesture,elapsedMs,frameGapP95Ms:gaps.sort((a,b)=>a-b)[Math.floor(gaps.length*.95)],backups:window.__sketchMetrics.backups-initial.backups,hashes:window.__sketchMetrics.hashes-initial.hashes,longTasks:window.__sketchMetrics.longTasks.filter(e=>e.start>=start)};
  },gesture);
  await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();result.saveRPCs=saveCalls-saves;report.measurements.push(result);
 }
 const final=await frame.evaluate(async()=>{const response=await fetch('/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner:null,payload:{sessionId:new URLSearchParams(location.search).get('sessionId')}})});return (await response.json()).value.drawing.scene.elements.find(e=>e.id==='perf-0');});assert.equal(final.x,50);report.persistedFinalEditVerified=true;
 report.pngExportMs=[];const rasterizations=await frame.evaluate(()=>window.__sketchMetrics.rasterizations);
 for(let i=0;i<3;i++){
  const menu=frame.getByRole('button',{name:'更多操作',exact:true});if(await menu.count())await menu.click();
  started=performance.now();await Promise.all([page.waitForEvent('download'),frame.getByRole('button',{name:'导出 PNG',exact:true}).click()]);report.pngExportMs.push(performance.now()-started);
 }
 report.pngRasterizations=(await frame.evaluate(()=>window.__sketchMetrics.rasterizations))-rasterizations;
 report.reopenMs=[];
 for(let i=0;i<5;i++){
  await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});assert((await input.innerText()).includes('性能测试保留输入'));
  started=performance.now();await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=await editorFrame(page);await frame.waitForFunction(()=>{try{return window.__sketchEditor().getSceneElements().length===250;}catch{return false;}});await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));report.reopenMs.push(performance.now()-started);
 }
 assert.equal(modelCalls,0);await hostContext(page,'theme','dark');await page.waitForTimeout(300);report.darkThemePropagated=await frame.evaluate(()=>window.__sketchEditor().getAppState().theme==='dark');await hostContext(page,'theme','light');
 report.sharedClientResponses=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('dsh-sketch-reference')&&!e.name.includes('/sketch-reference-assets/')).map(e=>({bytes:e.decodedBodySize})));
 report.pluginClientBytes=(await stat(process.env.DSH_PERF_CLIENT??'lib/client.js')).size;
 await mkdir('test-results',{recursive:true});await writeFile(`test-results/performance-${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){const page=browser.contexts()[0]?.pages()[0];const frame=page?.frames().find(f=>f.url().includes('/sketch-reference-assets/'));if(frame)console.log('Performance failure:',await frame.evaluate(()=>({alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent.slice(0,300)),elements:window.__sketchEditor?.().getSceneElements().length})).catch(()=>null));throw error;}finally{await browser.close();}
