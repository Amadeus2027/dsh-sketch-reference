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
import {build} from 'vite';

const recoveryBundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/editor/graph-recovery.ts'),formats:['es']}}});
const recoveryScript=(Array.isArray(recoveryBundle)?recoveryBundle[0]:recoveryBundle).output.find(x=>x.type==='chunk').code;

const owner={sessionId:'browser-graph',createdAt:'123',cwd:process.cwd()};
function table(){const rows=new Map();return {rows,get:k=>rows.get(k),get size(){return rows.size;},entries:()=>rows.entries(),keys:()=>rows.keys(),put:async(k,v)=>{rows.set(k,structuredClone(v));},delete:async k=>rows.delete(k),update:async(k,fn)=>{const value=fn(rows.get(k));rows.set(k,structuredClone(value));return value;}};}
const rootRows=table(),docRows=table(),graphRows=table();
const service=Object.assign(Object.create(SketchService.prototype),{repository:new Repository(rootRows),documents:new Repository(docRows),graphs:new GraphRepository(graphRows),advice:new CommentRepository(table()),resolve:async id=>{assert.equal(id,owner.sessionId);return owner;},ctx:{llm:{listProviders:()=>[]},logger:{warn:()=>{}}}});
const base={x:100,y:100,width:140,height:60,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1};
await service.repository.save(owner,{expectedRevision:null,mutationId:randomUUID(),scene:{elements:[{...base,id:'login-button',type:'rectangle'}],appState:{viewBackgroundColor:'#ffffff'},files:{}},goal:'首页：登录按钮'},async()=>{});
const staticHandler=createEditorAssetsHandler(resolve('lib/editor')),serverErrors=[];
let failGraph=false,failDocument=false,graphDelay=0,graphRequests=0,activeGraphRequests=0,maxActiveGraphRequests=0;
const rpcHandler=handler(async(method,body,signal)=>{
 if(method==='graph/save'&&failGraph){failGraph=false;throw Error('Injected graph offline failure');}
 if(method==='drawing/save'&&body.owner?.nodeId&&failDocument){failDocument=false;throw Error('Injected document offline failure');}
 if(method!=='graph/save')return service.operation(method,body,signal);
 graphRequests++;activeGraphRequests++;maxActiveGraphRequests=Math.max(maxActiveGraphRequests,activeGraphRequests);
 try{if(graphDelay)await new Promise(r=>setTimeout(r,graphDelay));return await service.operation(method,body,signal);}finally{activeGraphRequests--;}
},error=>serverErrors.push(String(error)));
const server=createServer((req,res)=>{if(req.url==='/test-graph-recovery.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(recoveryScript);}else if(req.url.startsWith('/sketch-reference-rpc/'))void rpcHandler(req,res);else if(req.url.startsWith('/sketch-reference-assets'))void staticHandler(req,res);else{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/sketch-reference-assets/?sessionId=${owner.sessionId}`;
await mkdir('test-results/graph',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});await context.addInitScript(installEditorInspection);const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
const overview=async()=>{await page.getByRole('button',{name:'工作流总览',exact:true}).click();await page.locator('.react-flow').waitFor();};
const saved=async()=>{await page.waitForFunction(()=>document.querySelector('.graphToolbar [role="status"]')?.textContent.startsWith('已保存'));};
const editNode=async id=>{const n=page.locator(`.react-flow__node[data-id="${id}"]`);await n.dblclick();await page.locator('.excalidraw').waitFor();};
try{
 await page.goto(url);await page.getByLabel('这张图准备用来做什么？').waitFor();await overview();
 await page.locator('.sketchGraphPreview img').waitFor();assert.equal(graphRows.size,0,'Opening overview must not migrate or overwrite the old drawing');
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'＋ 新建草图'}).click();await saved();const name=page.getByLabel('草图名称',{exact:true});await name.fill(`页面 ${i+1}`);await name.press('Tab');await saved();}
 const initial=service.graphs.get(owner);assert.equal(initial.content.nodes.length,5);const child=initial.content.nodes[1].id;
 // Continue interacting while the first layout request is deliberately slow.
 graphDelay=800;maxActiveGraphRequests=0;const layoutStart=graphRequests,oldPosition={...initial.content.nodes[0].position};
 const rootNode=await page.locator('.react-flow__node[data-id="root"] .sketchGraphNodeTitle').boundingBox();await page.mouse.move(rootNode.x+50,rootNode.y+15);await page.mouse.down();await page.mouse.move(rootNode.x+90,rootNode.y+35,{steps:8});await page.mouse.up();
 await page.getByRole('status').filter({hasText:'正在保存'}).waitFor();
 await page.getByRole('button',{name:'Zoom In',exact:true}).click();await page.getByRole('button',{name:'Zoom In',exact:true}).click();
 const canvas=await page.locator('.graphCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width-50,canvas.y+canvas.height-90);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width-100,canvas.y+canvas.height-120,{steps:8});await page.mouse.up();
 await saved();graphDelay=0;assert.equal(maxActiveGraphRequests,1);assert(graphRequests-layoutStart<=3);const layoutSaved=service.graphs.get(owner);assert.notDeepEqual(layoutSaved.content.nodes[0].position,oldPosition);assert(layoutSaved.content.viewport.zoom>1);
 const transform=await page.locator('.react-flow__viewport').evaluate(e=>e.style.transform),values=transform.match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/);assert(values,transform);for(const [i,key] of ['x','y','zoom'].entries())assert(Math.abs(Number(values[i+1])-layoutSaved.content.viewport[key])<1e-5);const layoutWrites=graphRequests-layoutStart;
 await page.reload();await page.getByLabel('这张图准备用来做什么？').waitFor();await overview();assert.deepEqual(service.graphs.get(owner),layoutSaved);await page.getByRole('button',{name:'Fit View',exact:true}).click();await saved();
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
 failDocument=true;await page.locator('.graphImport input').setInputFiles('test-results/graph/backup.json');await page.getByRole('button',{name:'继续恢复',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.graphToolbar [role="status"]').textContent.includes('正在保存'));await page.reload();await page.getByRole('button',{name:'继续恢复',exact:true}).waitFor();await page.getByRole('button',{name:'继续恢复',exact:true}).click();await page.getByRole('alert').filter({hasText:'备份已恢复为新节点'}).waitFor();assert.equal(service.graphs.get(owner).content.nodes.length,12);assert.equal(service.repository.get(owner).goal,'首页：登录按钮');
 failGraph=true;await page.getByRole('button',{name:'＋ 新建草图'}).click();await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();await page.getByRole('button',{name:'重试保存',exact:true}).click();await saved();assert.equal(service.graphs.get(owner).content.nodes.length,13);
 await page.reload();await page.getByLabel('这张图准备用来做什么？').waitFor();await overview();assert.equal(service.graphs.get(owner).content.nodes.length,13);assert.equal(service.graphs.get(owner).content.edges.length,4);
 // Independent window conflict must retain the local graph draft.
 const other=await context.newPage();await other.goto(url);await other.getByRole('button',{name:'工作流总览',exact:true}).click();await other.locator('.react-flow').waitFor();
 let acknowledge;const ackGate=new Promise(resolve=>{acknowledge=resolve;});await page.route('**/graph/save',async route=>{const response=await route.fetch();await ackGate;await route.fulfill({response});});
 await page.getByRole('button',{name:'＋ 新建草图'}).click();const deadline=Date.now()+5000;while(service.graphs.get(owner).content.nodes.length===13&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.equal(service.graphs.get(owner).content.nodes.length,14);
 await other.getByRole('button',{name:'＋ 新建草图'}).click();await other.getByRole('alert').filter({hasText:'另一窗口已修改'}).waitFor();
 const pendingFor=tab=>tab.evaluate(()=>{const id=sessionStorage.getItem('dsh-sketch:tab'),key=Object.keys(localStorage).find(k=>k.startsWith('dsh-sketch-graph:v1:')&&k.endsWith(':tab:'+id));return key?JSON.parse(localStorage.getItem(key)):null;});
 const conflict=await pendingFor(other);assert(conflict);acknowledge();await saved();assert.equal(await pendingFor(page),null);assert.deepEqual(await pendingFor(other),conflict);
 await other.reload();await other.getByRole('button',{name:'下载本地副本'}).waitFor();assert.deepEqual(await pendingFor(other),conflict);await other.close();await page.unroute('**/graph/save');
 // Capacity is admitted before an import task or any RPC can change the graph.
 const capacity=structuredClone(backup);while(capacity.content.nodes.length<100)capacity.content.nodes.push({id:randomUUID(),name:'容量节点',kind:'page',position:{x:0,y:0}});capacity.content.edges=[];capacity.documents=capacity.content.nodes.map(n=>({nodeId:n.id,drawing:null}));await writeFile('test-results/graph/capacity.json',JSON.stringify(capacity));
 const beforeCapacity=graphRequests;await page.locator('.graphImport input').setInputFiles('test-results/graph/capacity.json');await page.getByRole('alert').filter({hasText:'无法追加恢复'}).waitFor();assert.equal(graphRequests,beforeCapacity);assert.equal(service.graphs.get(owner).content.nodes.length,14);
 const denied=await context.newPage();await denied.addInitScript(()=>{const original=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='dsh-sketch-graph-recovery')throw new DOMException('Quota','QuotaExceededError');return original(name,...args);};});await denied.goto(url);await denied.getByRole('button',{name:'工作流总览',exact:true}).click();const beforeDenied=graphRequests;await denied.locator('.graphImport input').setInputFiles('test-results/graph/backup.json');await denied.getByRole('alert').filter({hasText:'尚未开始恢复'}).waitFor();assert.equal(graphRequests,beforeDenied);await denied.close();
 const aborted=await context.newPage();await aborted.addInitScript(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.transaction.db.name==='dsh-sketch-graph-recovery')request.addEventListener('success',()=>this.transaction.abort());return request;};});await aborted.goto(url);await aborted.getByRole('button',{name:'工作流总览',exact:true}).click();const beforeAborted=graphRequests;await aborted.locator('.graphImport input').setInputFiles('test-results/graph/backup.json');await aborted.getByRole('alert').filter({hasText:'尚未开始恢复'}).waitFor();assert.equal(graphRequests,beforeAborted);await aborted.close();
 const indexed=await page.evaluate(async owner=>{
  const {GraphRecovery}=await import('/test-graph-recovery.js');const a=new GraphRecovery(owner,'large-a'),b=new GraphRecovery(owner,'large-b');
  const nodeId=crypto.randomUUID(),content={nodes:[{id:'root',name:'root',kind:'page',position:{x:0,y:0}},{id:nodeId,name:'child',kind:'page',position:{x:0,y:0}}],edges:[],viewport:{x:0,y:0,zoom:1}};
  const task={graph:{expectedRevision:null,mutationId:crypto.randomUUID(),content},documents:Array.from({length:6},()=>({nodeId,input:{expectedRevision:null,mutationId:crypto.randomUUID(),goal:'',scene:{elements:Array.from({length:300},(_,i)=>({id:'t'+i,type:'text',x:0,y:0,width:100,height:30,text:'x'.repeat(4000)})),appState:{},files:{}}}}))};
  await a.writeImport(task);const other={...task,graph:{...task.graph,mutationId:crypto.randomUUID()}};await b.writeImport(other);const next={...task,graph:{...task.graph,mutationId:crypto.randomUUID()}};await a.writeImport(next);await a.clearImport(task.graph.mutationId);
  const result={bytes:JSON.stringify(task).length,refreshed:(await new GraphRecovery(owner,'large-a').readImport()).graph.mutationId===next.graph.mutationId,otherUntouched:(await b.readImport()).graph.mutationId===other.graph.mutationId,localImport:localStorage.getItem(a.importKey)};await a.clearImport(next.graph.mutationId);await b.clearImport(other.graph.mutationId);return result;
 },owner);assert(indexed.bytes>5*1024*1024);assert(indexed.refreshed&&indexed.otherUntouched);assert.equal(indexed.localImport,null);
 // Thirty nodes with visible-only thumbnails; collect timing, not fabricated thresholds.
 graph=service.graphs.get(owner);const large=structuredClone(graph.content);while(large.nodes.length<30){const i=large.nodes.length;large.nodes.push({id:randomUUID(),name:`性能草图 ${i}`,kind:'page',position:{x:(i%6)*360,y:Math.floor(i/6)*290}});}await service.graphs.save(owner,{expectedRevision:graph.revision,mutationId:randomUUID(),content:large},async()=>{});
 const started=performance.now();await page.reload();await page.getByRole('button',{name:'工作流总览',exact:true}).click();await page.locator('.react-flow__node').first().waitFor();const overviewMs=Math.round(performance.now()-started);assert(await page.locator('.react-flow__node').count()<30);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/graph/narrow.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(serverErrors.length,2,'Only injected offline failures are expected');
 await writeFile('test-results/graph/report.json',JSON.stringify({ok:true,nodes:30,overviewMs,layoutWrites,indexedImportBytes:indexed.bytes,rootKey:ownerKey(owner),cases:['legacy root retained','five independent documents','element and region anchors','continuous drag/pan/zoom with delayed RPC, serialized merged writes and final viewport match','additive backup restore with interrupted retry after refresh','graph offline retry','reload persistence','interleaved two-window CAS conflict and mutation-safe recovery after refresh','100-node additive import capacity rejected before RPC','IndexedDB unavailable rejected before RPC','over-5MiB IndexedDB import, per-tab isolation and mutation-safe cleanup','thirty nodes visible-only','390px no horizontal overflow','no external requests'],boundary:'Built UI and actual RPC/repositories with isolated in-memory storage; no DSH installation, process restart persistence or real-model acceptance.'},null,2));
 console.log(`PASS: Sketch Graph browser flow, 30-node overview ${overviewMs}ms. Isolated KV; no real model or DSH installation claims.`);
}catch(error){await page.screenshot({path:'test-results/graph/failure.png',fullPage:true});console.error(await page.locator('.graphBody,.graphCanvas,.react-flow').evaluateAll(nodes=>nodes.map(n=>({class:n.className,box:n.getBoundingClientRect().toJSON()}))));console.error('Browser errors',errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
