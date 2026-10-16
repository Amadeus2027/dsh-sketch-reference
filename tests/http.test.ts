import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {createServer,request,type Server} from 'node:http';
import {z} from 'zod';
import {handler} from '../src/host/http.ts';
import {initialGraph,graphSaveSchema} from '../src/core/graph.ts';
import {RPC_LIMITS,requestBodyLimit} from '../src/core/limits.ts';
let server:Server,base:string;
beforeAll(async()=>{server=createServer(handler(async(_method,body)=>z.object({value:z.string()}).parse(body.payload),()=>{}));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('port');base='http://127.0.0.1:'+address.port;});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
const body=()=>({protocolVersion:1,requestId:crypto.randomUUID(),owner:null,payload:{value:'ok'}});
describe('HTTP trust and parsing',()=>{
 it('keeps graph saves bounded without widening read or unrelated update requests',async()=>{
  expect(requestBodyLimit('graph/get')).toBe(RPC_LIMITS.envelopeBytes);expect(requestBodyLimit('comment/update')).toBe(RPC_LIMITS.envelopeBytes);
  const response=await fetch(base+'/sketch-reference-rpc/v1/graph/save',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(RPC_LIMITS.graphBodyBytes+1)});expect(response.status).toBe(413);expect(await response.json()).toMatchObject({error:{code:'BODY_LIMIT'}});
 });
 it('saves a legal 100-node graph whose UTF-8 body exceeds the small RPC envelope',async()=>{
  const content=initialGraph();for(let i=1;i<100;i++)content.nodes.push({id:crypto.randomUUID(),name:`草图 ${i}：${'页面需求'.repeat(8)}`,kind:'page',position:{x:(i%10)*350,y:Math.floor(i/10)*300}});
  const payload={expectedRevision:null,mutationId:crypto.randomUUID(),content};graphSaveSchema.parse(payload);
  const encoded=JSON.stringify({...body(),payload});expect(Buffer.byteLength(encoded)).toBeGreaterThan(16384);
  const graphServer=createServer(handler(async(_method,request)=>graphSaveSchema.parse(request.payload),()=>{}));
  await new Promise<void>(resolve=>graphServer.listen(0,'127.0.0.1',resolve));const address=graphServer.address();if(!address||typeof address==='string')throw Error('port');
  try{const response=await fetch(`http://127.0.0.1:${address.port}/sketch-reference-rpc/v1/graph/save`,{method:'POST',headers:{'content-type':'application/json'},body:encoded});expect(response.status).toBe(200);expect((await response.json()).value.content.nodes).toHaveLength(100);}
  finally{graphServer.closeAllConnections();await new Promise<void>(resolve=>graphServer.close(()=>resolve()));}
 });
 it('rejects cross-origin requests and untrusted Host',async()=>{const a=await fetch(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json',origin:'https://elsewhere.test'},body:JSON.stringify(body())});expect(a.status).toBe(403);const status=await new Promise<number>(resolve=>{const r=request(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{host:'elsewhere.test','content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode!);});r.end(JSON.stringify(body()));});expect(status).toBe(403);});
 it('returns validation errors as 400 and echoes the request identity',async()=>{const request={...body(),payload:{value:42}};const r=await fetch(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});expect(r.status).toBe(400);expect(await r.json()).toMatchObject({requestId:request.requestId,error:{code:'BAD_REQUEST'}});});
 it('rejects large bodies before decoding',async()=>{const r=await fetch(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)});expect(r.status).toBe(413);});
 it('counts UTF-8 bytes rather than JavaScript string length',async()=>{
  const payload=JSON.stringify({...body(),payload:{value:'汉'.repeat(6000)}});
  expect(payload.length).toBeLessThan(16384);
  const r=await fetch(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'},body:payload});
  expect(r.status).toBe(413);
 });
 it('accepts valid JSON delivered in separate chunks',async()=>{
  const result=await new Promise<{status:number;body:unknown}>((resolve,reject)=>{
   const r=request(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'}},res=>{
    const chunks:Buffer[]=[];
    res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
    res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
   });
   r.on('error',reject);
   const payload=JSON.stringify(body());
   r.write(payload.slice(0,20));
   const finish=setTimeout(()=>r.end(payload.slice(20)),20);
   r.on('close',()=>clearTimeout(finish));
  });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ok:true,value:{value:'ok'}});
 });
 it('returns a structured 413 for oversized chunked bodies without resetting the connection',async()=>{
  const result=await new Promise<{status:number;body:unknown}>((resolve,reject)=>{
   const r=request(base+'/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'}},res=>{
    const chunks:Buffer[]=[];
    res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
    res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
   });
   r.on('error',reject);
   r.write('x'.repeat(17000));
   const finish=setTimeout(()=>r.end('tail'),100);
   r.on('close',()=>clearTimeout(finish));
  });
  expect(result.status).toBe(413);
  expect(result.body).toMatchObject({ok:false,error:{code:'BODY_LIMIT'}});
 });
});
