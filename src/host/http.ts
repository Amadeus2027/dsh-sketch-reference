import {ZodError} from 'zod';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {RPC,SketchError,envelopeSchema} from '../core/contracts.ts';
export function trusted(req:IncomingMessage):boolean {
 const host=req.headers.host;
 if(!host || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host))return false;
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 if(req.headers.origin && req.headers.origin!==`http://${host}`)return false;
 return req.rawHeaders.filter((_,i)=>i%2===0 && req.rawHeaders[i]?.toLowerCase()==='host').length===1;
}
export function handler(operation:(method:string,body:ReturnType<typeof envelopeSchema.parse>,signal:AbortSignal)=>Promise<unknown>,log:(error:unknown)=>void) {
 return async(req:IncomingMessage,res:ServerResponse)=>{
  let id='invalid-request'; const abort=new AbortController();
  res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  const send=(status:number,data:unknown)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   if(!trusted(req))throw new SketchError('FORBIDDEN','请求来源不可信',403);
   if(req.method!=='POST')throw new SketchError('METHOD','仅支持 POST',405);
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new SketchError('MEDIA_TYPE','仅支持 JSON',415);
   const method=new URL(req.url??'/',`http://${req.headers.host}`).pathname.slice(RPC.length+1);
   if(!/^[a-z/-]+$/.test(method))throw new SketchError('NOT_FOUND','接口不存在',404);
   const cap=method==='advice/generate'?3*1024*1024+16384:method==='drawing/save'?2*1024*1024+16384:16384;
   if(Number(req.headers['content-length'])>cap)throw new SketchError('BODY_LIMIT','请求过大',413);
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>cap)throw new SketchError('BODY_LIMIT','请求过大',413);chunks.push(b);}
   let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SketchError('BAD_JSON','请求格式错误');}
   const body=envelopeSchema.safeParse(raw);
   if(!body.success)throw new SketchError('BAD_REQUEST','请求字段无效');
   id=body.data.requestId;
   const value=await operation(method,body.data,abort.signal);
   send(200,{ok:true,requestId:id,value});
  }catch(error){
   if(error instanceof SketchError)send(error.status,{ok:false,requestId:id,error:{code:error.code,message:error.message}});
   else if(error instanceof ZodError)send(400,{ok:false,requestId:id,error:{code:"BAD_REQUEST",message:"请求字段无效"}});
   else {log(error);send(500,{ok:false,requestId:id,error:{code:'INTERNAL',message:'请求失败，请检查宿主日志与 DS 配置'}});}
  }
 };
}
