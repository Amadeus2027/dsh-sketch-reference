// Explicitly seeds only a dedicated test session through the real plugin RPC.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {demoScenes} from './fixtures/graph-demo.mjs';
import {sceneSchema} from '../src/core/contracts.ts';
const [log,sessionId,resume]=process.argv.slice(2);if(!log||!sessionId)throw Error('Usage: node --experimental-transform-types tests/prepare-graph-demo.mjs private-host.log dedicated-session-id [--resume-empty]');
const match=(await readFile(log,'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);if(!match)throw Error('Local host URL not found');
const auth=await fetch(match[0],{redirect:'manual'}),cookie=auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),origin=new URL(match[0]).origin;
async function rpc(method,owner,payload){const r=await fetch(origin+'/sketch-reference-rpc/v1/'+method,{method:'POST',headers:{'content-type':'application/json',cookie,origin},body:JSON.stringify({protocolVersion:1,requestId:randomUUID(),owner,payload})});const v=await r.json();if(!v.ok)throw Error(v.error.code+': '+v.error.message);return v.value;}
const loaded=await rpc('drawing/get',null,{sessionId}),owner=loaded.owner,old=(await rpc('graph/get',owner,null)).graph;
if(loaded.drawing?.scene.elements.length||old&&resume!=='--resume-empty')throw Error('Refusing to replace a nonempty test session');
const prepared=Object.fromEntries(Object.entries(demoScenes).map(([k,v])=>[k,{...v,scene:sceneSchema.parse(JSON.parse(JSON.stringify(v.scene)))}]));
const ids=old?{root:'root',login:old.content.nodes.find(n=>n.name==='登录页')?.id,product:old.content.nodes.find(n=>n.name==='商品详情')?.id,banner:old.content.nodes.find(n=>n.name==='Banner 细节')?.id}:{root:'root',login:randomUUID(),product:randomUUID(),banner:randomUUID()};
if(old){if(old.content.nodes.length!==4||Object.values(ids).some(id=>!id)||(await rpc('graph/documents',owner,null)).some(d=>d.drawing?.scene.elements.length))throw Error('Resume requires exactly four empty prepared nodes');}
const nodes=[{id:'root',name:'首页',kind:'page',position:{x:0,y:90}},{id:ids.login,name:'登录页',kind:'page',position:{x:420,y:0}},{id:ids.product,name:'商品详情',kind:'page',position:{x:420,y:330}},{id:ids.banner,name:'Banner 细节',kind:'detail',position:{x:840,y:150}}];
const edges=[{id:randomUUID(),sourceNodeId:'root',targetNodeId:ids.login,type:'navigation',anchor:{kind:'elements',elementIds:['home-login','home-login-label']},label:'登录'},{id:randomUUID(),sourceNodeId:'root',targetNodeId:ids.product,type:'navigation',anchor:{kind:'elements',elementIds:['home-product']},label:'查看商品'},{id:randomUUID(),sourceNodeId:'root',targetNodeId:ids.banner,type:'detail',anchor:{kind:'region',region:{x:40,y:120,width:640,height:152}},label:'Banner 视觉细节'}];
if(!old)await rpc('graph/save',owner,{expectedRevision:null,mutationId:randomUUID(),content:{nodes,edges,viewport:{x:70,y:80,zoom:1}}});
for(const [key,value] of Object.entries(prepared)){const target=key==='root'?owner:{...owner,nodeId:ids[key]};await rpc('drawing/save',target,{expectedRevision:key==='root'?loaded.drawing?.revision??null:null,mutationId:randomUUID(),scene:value.scene,goal:value.goal});}
await mkdir('test-results/graph',{recursive:true});await writeFile('test-results/graph/real-demo.json',JSON.stringify({prepared:true,sessionId,nodeIds:ids,source:'Editable scenes prepared through actual RPC; no model responses or screenshots synthesized.'},null,2));console.log('Prepared 4 editable sketches and 3 typed edges in dedicated session.');
