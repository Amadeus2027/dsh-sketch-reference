import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {createServer,request,type Server} from 'node:http';
import {z} from 'zod';
import {handler} from '../src/host/http.ts';
let server:Server,base:string;
beforeAll(async()=>{server=createServer(handler(async(_method,body)=>z.object({value:z.string()}).parse(body.payload),()=>{}));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('port');base='http://127.0.0.1:'+address.port;});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
const body=()=>({protocolVersion:1,requestId:crypto.randomUUID(),owner:null,payload:{value:'ok'}});
describe('HTTP trust and parsing',()=>{
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
