// Real built React Flow + Excalidraw, actual RPC/repositories, isolated local KV.
// This does not assert DSH installation compatibility or real-model quality.
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {Repository} from '../src/host/repository.ts';
import {GraphRepository} from '../src/host/graph-repository.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import {SketchService} from '../src/host/service.ts';
import {createEditorAssetsHandler} from '../src/host/static.ts';
import {handler} from '../src/host/http.ts';
import {ownerKey} from '../src/core/contracts.ts';
import {installEditorInspection} from './fixtures/browser-session.mjs';

const owner={sessionId:'browser-graph',createdAt:'123',cwd:process.cwd()};
function table(){const rows=new Map();return {rows,get:k=>rows.get(k),get size(){return rows.size;},entries:()=>rows.entries(),keys:()=>rows.keys(),put:async(k,v)=>{rows.set(k,structuredClone(v));},delete:async k=>rows.delete(k),update:async(k,fn)=>{const value=fn(rows.get(k));rows.set(k,structuredClone(value));return value;}};}
const rootRows=table(),docRows=table(),graphRows=table();
const service=Object.assign(Object.create(SketchService.prototype),{repository:new Repository(rootRows),documents:new Repository(docRows),graphs:new GraphRepository(graphRows),advice:new CommentRepository(table()),resolve:async id=>{assert.equal(id,owner.sessionId);return owner;},ctx:{llm:{listProviders:()=>[]},logger:{warn:()=>{}}}});
const base={x:100,y:100,width:140,height:60,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1};
await service.repository.save(owner,{expectedRevision:null,mutationId:randomUUID(),scene:{elements:[{...base,id:'login-button',type:'rectangle'}],appState:{viewBackgroundColor:'#ffffff'},files:{}},goal:'首页：登录按钮'},async()=>{});
const staticHandler=createEditorAssetsHandler(resolve('lib/editor')),serverErrors=[];
let failGraph=false,failDocument=false;
const rpcHandler=handler(async(method,body,signal)=>{
 if(method==='graph/save'&&failGraph){failGraph=false;throw Error('Injected graph offline failure');}
 if(method==='drawing/save'&&body.owner?.nodeId&&failDocument){failDocument=false;throw Error('Injected document offline failure');}
 return service.operation(method,body,signal);
},error=>serverErrors.push(String(error)));
const server=createServer((req,res)=>{if(req.url.startsWith('/sketch-reference-rpc/'))void rpcHandler(req,res);else if(req.url.startsWith('/sketch-reference-assets'))void staticHandler(req,res);else{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/sketch-reference-assets/?sessionId=${owner.sessionId}`;
await mkdir('test-results/graph',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});await context.addInitScript(installEditorInspection);const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
const overview=async()=>{await page.getByRole('button',{name:'工作流总览',exact:true}).click();await page.locator('.react-flow').waitFor();};
const saved=async()=>{await page.waitForFunction(()=>!document.querySelector('.graphToolbar [role="status"]')?.textContent.includes('正在保存')&&!document.querySelector('.graphToolbar [role="status"]')?.textContent.includes('待确认'));};
const editNode=async id=>{const n=page.locator(`.react-flow__node[data-id="${id}"]`);await n.dblclick();await page.locator('.excalidraw').waitFor();};
try{
 await page.goto(url);await page.getByLabel('这张图准备用来做什么？').waitFor();await overview();
 await page.locator('.sketchGraphPreview img').waitFor();assert.equal(graphRows.size,0,'Opening overview must not migrate or overwrite the old drawing');
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'＋ 新建草图'}).click();await saved();const name=page.getByLabel('草图名称',{exact:true});await name.fill(`页面 ${i+1}`);await name.press('Tab');await saved();}
 const initial=service.graphs.get(owner);assert.equal(initial.content.nodes.length,5);const child=initial.content.nodes[1].id;
 await editNode(child);await page.getByLabel('这张图准备用来做什么？').fill('登录页独立草稿');
 // Test-only React inspection obtains the real public Excalidraw API.
 await page.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});
 await page.evaluate(base=>window.__sketchEditor().updateScene({elements:[{...base,id:'child-form',type:'rectangle'}]}),base);
 await overview();assert.equal(service.repository.get(owner).goal,'首页：登录按钮');assert.equal(service.documents.get({...owner,nodeId:child}).goal,'登录页独立草稿');assert(service.documents.get({...owner,nodeId:child}).scene.elements.length);
 await editNode('root');await page.waitForFunction(()=>{try{return !!window.__sketchEditor();}catch{return false;}});await page.evaluate(()=>window.__sketchEditor().updateScene({appState:{selectedElementIds:{'login-button':true}}}));
 await page.getByRole('button',{name:'关联工具',exact:true}).click();await page.getByLabel('目标',{exact:true}).selectOption(child);await page.getByRole('button',{name:'创建关联',exact:true}).click();await page.locator('.react-flow').waitFor();await saved();
 let graph=service.graphs.get(owner);assert.equal(graph.content.edges.length,1);assert.equal(graph.content.edges[0].anchor.kind,'elements');assert(graph.content.edges[0].anchor.elementIds.includes('login-button'));
 await page.locator(`.react-flow__edge[data-id="${graph.content.edges[0].id}"]`).click();await page.getByRole('button',{name:'重新绑定',exact:true}).click();await overview();await editNode(child);await page.getByRole('button',{name:'关联工具',exact:true}).click();await page.getByRole('button',{name:'创建关联',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重新绑定',exact:true}).count(),0);await overview();
 await editNode('root');await page.getByRole('button',{name:'关联工具',exact:true}).click();await page.getByLabel('关联类型',{exact:true}).selectOption('detail');await page.getByLabel('新关联草图名称',{exact:true}).fill('Banner 细节');await page.evaluate(()=>window.__sketchEditor().updateScene({appState:{selectedElementIds:{}}}));await page.getByRole('button',{name:'创建关联',exact:true}).click();
 const picker=await page.getByRole('region',{name:'拖动框选关联区域'}).boundingBox();await page.mouse.move(picker.x+80,picker.y+90);await page.mouse.down();await page.mouse.move(picker.x+280,picker.y+210,{steps:8});await page.mouse.up();await page.locator('.react-flow').waitFor();await saved();
 graph=service.graphs.get(owner);assert.equal(graph.content.nodes.length,6);assert.equal(graph.content.edges[1].type,'detail');assert.equal(graph.content.edges[1].anchor.kind,'region');
 await page.getByRole('button',{name:'适应视图',exact:true}).count();
 await page.screenshot({path:'test-results/graph/overview.png',fullPage:true});
 await page.locator('.graphMore>summary').click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'备份工作流'}).click();const backupDownload=await downloading;await backupDownload.saveAs('test-results/graph/backup.json');const backup=JSON.parse(await readFile('test-results/graph/backup.json','utf8'));assert.equal(backup.documents.length,6);
 failDocument=true;await page.locator('.graphImport input').setInputFiles('test-results/graph/backup.json');await page.getByRole('button',{name:'继续恢复',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.graphToolbar [role="status"]').textContent.includes('正在保存'));await page.getByRole('button',{name:'继续恢复',exact:true}).click();await page.getByRole('alert').filter({hasText:'备份已恢复为新节点'}).waitFor();assert.equal(service.graphs.get(owner).content.nodes.length,12);assert.equal(service.repository.get(owner).goal,'首页：登录按钮');
 failGraph=true;await page.getByRole('button',{name:'＋ 新建草图'}).click();await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();await page.getByRole('button',{name:'重试保存',exact:true}).click();await saved();assert.equal(service.graphs.get(owner).content.nodes.length,13);
 await page.reload();await page.getByLabel('这张图准备用来做什么？').waitFor();await overview();assert.equal(service.graphs.get(owner).content.nodes.length,13);assert.equal(service.graphs.get(owner).content.edges.length,4);
 // Independent window conflict must retain the local graph draft.
 const other=await context.newPage();await other.goto(url);await other.getByRole('button',{name:'工作流总览',exact:true}).click();await other.locator('.react-flow').waitFor();await page.getByRole('button',{name:'＋ 新建草图'}).click();await saved();await other.getByRole('button',{name:'＋ 新建草图'}).click();await other.getByRole('alert').filter({hasText:'另一窗口已修改'}).waitFor();await other.getByRole('button',{name:'下载本地副本'}).waitFor();await other.close();
 // Thirty nodes with visible-only thumbnails; collect timing, not fabricated thresholds.
 graph=service.graphs.get(owner);const large=structuredClone(graph.content);while(large.nodes.length<30){const i=large.nodes.length;large.nodes.push({id:randomUUID(),name:`性能草图 ${i}`,kind:'page',position:{x:(i%6)*360,y:Math.floor(i/6)*290}});}await service.graphs.save(owner,{expectedRevision:graph.revision,mutationId:randomUUID(),content:large},async()=>{});
 const started=performance.now();await page.reload();await page.getByRole('button',{name:'工作流总览',exact:true}).click();await page.locator('.react-flow__node').first().waitFor();const overviewMs=Math.round(performance.now()-started);assert(await page.locator('.react-flow__node').count()<30);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/graph/narrow.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(serverErrors.length,2,'Only injected offline failures are expected');
 await writeFile('test-results/graph/report.json',JSON.stringify({ok:true,nodes:30,overviewMs,rootKey:ownerKey(owner),cases:['legacy root retained','five independent documents','element and region anchors','additive backup restore with interrupted retry','graph offline retry','reload persistence','two-window CAS conflict','thirty nodes visible-only','390px no horizontal overflow','no external requests'],boundary:'Built UI and actual RPC/repositories with isolated in-memory storage; no DSH installation, process restart persistence or real-model acceptance.'},null,2));
 console.log(`PASS: Sketch Graph browser flow, 30-node overview ${overviewMs}ms. Isolated KV; no real model or DSH installation claims.`);
}catch(error){await page.screenshot({path:'test-results/graph/failure.png',fullPage:true});console.error(await page.locator('.graphBody,.graphCanvas,.react-flow').evaluateAll(nodes=>nodes.map(n=>({class:n.className,box:n.getBoundingClientRect().toJSON()}))));console.error('Browser errors',errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
