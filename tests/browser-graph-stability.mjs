// Dedicated installed DSH profile only. No model calls or user data.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepareHost,hostContext,editorFrame,installEditorInspection} from './fixtures/browser-session.mjs';

const url=process.env.DSH_SMOKE_URL;if(!url)throw Error('Set DSH_SMOKE_URL to a dedicated authenticated host');
const sourceVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const out=process.env.DSH_TEST_OUTPUT??'test-results/graph-stability',verify=process.env.DSH_GRAPH_VERIFY==='restart';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(25000);await page.addInitScript(installEditorInspection);const errors=[];let previewReads=0,revisionReads=0;page.on('request',r=>{if(r.url().endsWith('/document/get'))previewReads++;if(r.url().endsWith('/graph/document-revisions'))revisionReads++;});page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('Renderer crashed'));
try{
 await prepareHost(page,url);const previous=verify?JSON.parse(await readFile(out+'/snapshot.json','utf8')):null;
 if(previous)await hostContext(page,'open',previous.owner.sessionId);else await hostContext(page,'create',resolve(process.env.DSH_TEST_WORKSPACE??process.cwd()));
 const input=page.locator('[contenteditable=true]');await input.fill('压力回归保留原生输入，不发送');await page.getByRole('button',{name:'打开手绘参考板',exact:true}).click();const frame=await editorFrame(page);
 const call=(method,owner,payload)=>frame.evaluate(async args=>{const r=await fetch('/sketch-reference-rpc/v1/'+args.method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner:args.owner,payload:args.payload})});const b=await r.json();if(!b.ok)throw Error(`${b.error.code}: ${b.error.message}`);return b.value;},{method,owner,payload});
 const loaded=await call('drawing/get',null,{sessionId:new URL(frame.url()).searchParams.get('sessionId')}),owner=loaded.owner;
 if(previous){assert.deepEqual((await call('graph/get',owner,null)).graph,previous.graph);assert.deepEqual(loaded.drawing,previous.drawing);}
 else{
  await frame.getByLabel('这张图准备用来做什么？').fill('大图保存和交互回归');await frame.locator('.excalidraw').click();await page.keyboard.press('r');const b=await frame.locator('.excalidraw').boundingBox();await page.mouse.move(b.x+260,b.y+180);await page.mouse.down();await page.mouse.move(b.x+400,b.y+260,{steps:10});await page.mouse.up();
  await expect.poll(async()=>{const d=(await call('drawing/get',owner,{sessionId:owner.sessionId})).drawing;return !!d?.scene.elements.length&&d.goal==='大图保存和交互回归';}).toBe(true);
  const content={nodes:Array.from({length:100},(_,i)=>({id:i?crypto.randomUUID():'root',name:`页面 ${i}`,kind:'page',position:{x:(i%10)*360,y:Math.floor(i/10)*290}})),edges:[],viewport:{x:80,y:80,zoom:.65}};
  for(let i=0;i<300;i++)content.edges.push({id:crypto.randomUUID(),sourceNodeId:content.nodes[i%100].id,targetNodeId:content.nodes[(i+1)%100].id,type:'navigation',anchor:{kind:'node'},label:`页面跳转 ${i}`});
  const payload={expectedRevision:null,mutationId:crypto.randomUUID(),content};assert(Buffer.byteLength(JSON.stringify(payload))>16384);await call('graph/save',owner,payload);
 }
 await page.getByRole('button',{name:'画板全屏',exact:true}).click();await page.getByRole('button',{name:'收起悬浮对话',exact:true}).click();await frame.getByRole('button',{name:'工作流总览',exact:true}).click();await frame.locator('.react-flow__node[data-id="root"]').waitFor();
 await expect(frame.locator('.react-flow__node[data-id="root"] .react-flow__handle.source')).toHaveCount(1);
 const get=async()=>(await call('graph/get',owner,null)).graph;
 const settled=()=>frame.waitForFunction(()=>document.querySelector('.graphToolbar [role="status"]')?.textContent.startsWith('已保存'));
 const drag=async dx=>{const b=await frame.locator('.react-flow__node[data-id="root"] .sketchGraphNodeTitle').boundingBox();assert(b);await page.mouse.move(b.x+40,b.y+16);await page.mouse.down();await page.mouse.move(b.x+40+dx,b.y+24,{steps:12});await page.mouse.up();};
 // Overview revisits retain images while one metadata request detects changed revisions.
 const root=frame.locator('.react-flow__node[data-id="root"]');await root.locator('img').waitFor();const warmSrc=await root.locator('img').getAttribute('src');await root.dblclick();await frame.locator('.excalidraw').waitFor();let previewStart=previewReads,revisionStart=revisionReads;await frame.getByRole('button',{name:'工作流总览',exact:true}).click();await root.locator('img').waitFor();await page.waitForTimeout(250);assert.equal(previewReads-previewStart,0);assert.equal(revisionReads-revisionStart,1);assert.equal(await root.locator('img').getAttribute('src'),warmSrc);
 await root.dblclick();await frame.locator('.excalidraw').waitFor();await frame.getByLabel('这张图准备用来做什么？').fill('大图缓存变更回归 '+Date.now());previewStart=previewReads;await frame.getByRole('button',{name:'工作流总览',exact:true}).click();await root.locator('img').waitFor();assert.equal(previewReads-previewStart,1);assert.notEqual(await root.locator('img').getAttribute('src'),warmSrc);
 const before=await get(),route='**/sketch-reference-rpc/v1/graph/save';let active=0,maxActive=0,writes=0;
 await page.route(route,async r=>{active++;maxActive=Math.max(maxActive,active);writes++;try{await new Promise(resolve=>setTimeout(resolve,800));await r.continue();}finally{active--;}});
 await drag(24);await frame.getByRole('status').filter({hasText:'正在保存'}).waitFor();for(let i=0;i<4;i++){await drag(i%2?-18:24);await frame.getByRole('button',{name:i%2?'Zoom Out':'Zoom In',exact:true}).click();}await settled();await page.unroute(route);
 assert.equal(maxActive,1);const after=await get();assert.notDeepEqual(after.content.nodes[0].position,before.content.nodes[0].position);
 // CSSOM rounds translate() decimals; allow 0.001 CSS pixel, not a lost viewport update.
 let viewportCheck;await expect.poll(async()=>{const stored=await get(),transform=await frame.locator('.react-flow__viewport').evaluate(e=>e.style.transform),values=transform.match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/);viewportCheck={transform,stored:stored.content.viewport};return !!values&&['x','y','zoom'].every((key,i)=>Math.abs(Number(values[i+1])-stored.content.viewport[key])<(key==='zoom'?1e-5:1e-3));}).toBe(true).catch(error=>{console.error('Viewport mismatch',viewportCheck);throw error;});
 await page.route(route,r=>r.abort('failed'),{times:1});await drag(20);await frame.getByRole('button',{name:'重试保存',exact:true}).waitFor();await frame.getByRole('button',{name:'重试保存',exact:true}).click();await settled();const retried=await get();await drag(20);await settled();assert.notDeepEqual((await get()).content.nodes[0].position,retried.content.nodes[0].position);
 const snapshot={owner,graph:await get(),drawing:(await call('drawing/get',owner,{sessionId:owner.sessionId})).drawing};await writeFile(out+'/snapshot.json',JSON.stringify(snapshot,null,2));
 await page.screenshot({path:out+'/overview.png'});await frame.getByRole('button',{name:'返回聊天 ×',exact:true}).click();await expect(page.locator('iframe[title="手绘参考板"]')).toHaveCount(0);assert((await input.innerText()).includes('保留原生输入'));
 await page.getByRole('button',{name:'打开手绘参考板',exact:true}).click();const reopened=await editorFrame(page);await reopened.getByRole('button',{name:'工作流总览',exact:true}).click();await reopened.locator('.react-flow__node[data-id="root"]').waitFor();
 const retained=await reopened.evaluate(async owner=>{const r=await fetch('/sketch-reference-rpc/v1/graph/get',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner,payload:null})});return (await r.json()).value.graph;},owner);assert.deepEqual(retained,snapshot.graph);assert.deepEqual(errors,[]);
 await writeFile(out+(verify?'/restart-report.json':'/report.json'),JSON.stringify({ok:true,sourceVersion,nodes:100,edges:300,slowSaveMs:800,slowWrites:writes,maxActive,warmPreviewReads:0,changedPreviewReads:1,processRestartVerified:verify,cases:['native drawing saved','full graph HTTP save','drag and zoom while saving','transport failure retry and subsequent drag','same final viewport and persisted graph','close/reopen preserves graph and native input'],realModel:false,errors},null,2));console.log('PASS: installed DSH 100-node/300-edge drag, slow save, retry, viewport and reopen'+(verify?', process restart persistence':'')+'; no model calls.');
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
