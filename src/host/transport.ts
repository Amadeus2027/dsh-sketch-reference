import type {Context} from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {ASSETS,RPC,ownerSchema,sameOwner,SketchError,type Owner,type envelopeSchema} from '../core/contracts.ts';
import {AGENT_EVENTS} from '../core/agent.ts';
import {handler} from './http.ts';
import {createEditorAssetsHandler} from './static.ts';

type Peer={signal:AbortSignal};
type RequestHandler=(req:IncomingMessage,res:ServerResponse,peer?:Peer)=>void|Promise<void>;
interface Operations {
 root:string;signal:AbortSignal;
 run(method:string,body:ReturnType<typeof envelopeSchema.parse>,signal:AbortSignal):Promise<unknown>;
 resolve(sessionId:string,signal:AbortSignal):Promise<Owner>;
 connect(owner:Owner,res:ServerResponse):void;
 track<T>(task:Promise<T>):Promise<T>;
}

/** Legacy Connection owns admission; current WebServer passes an admitted Peer.
 * Never infer authentication from a missing legacy method alone. */
export function requestRejection(connection:unknown,req:IncomingMessage,peer?:Peer):number|undefined {
 if(!connection||typeof connection!=='object')return 503;
 if('requestRejection' in connection&&typeof connection.requestRejection==='function'){
  const status:unknown=connection.requestRejection(req);
  return status===undefined?undefined:typeof status==='number'&&status>=400&&status<=599?status:503;
 }
 if('authentication' in connection){
  // Cordis 4.2 guards access to separately injected sub-services. WebServer's
  // required-auth route already admitted this Peer; do not read that service.
  return peer&&!peer.signal.aborted?undefined:401;
 }
 return 503;
}

/** One set of handlers per plugin lifetime; no per-request asset factory or timer. */
export function registerTransport(ctx:Context,operations:Operations):()=>void {
 const disposers:Array<()=>void>=[];
 const register=(kind:'prefix'|'exact',path:string,run:RequestHandler)=>{
  const route={kind,path,auth:'required' as const,handler:(req:IncomingMessage,res:ServerResponse,peer?:Peer)=>{
   const rejection=requestRejection(ctx.connection,req,peer);
   if(rejection||operations.signal.aborted){res.writeHead(rejection??503);res.end('unauthorized');return;}
   return run(req,res,peer);
  }};
  disposers.push(ctx.webServer.register(route));
 };
 const dispose=()=>{for(const unregister of disposers.splice(0).reverse())unregister();};
 try{
  register('prefix',ASSETS,createEditorAssetsHandler(operations.root));
  register('prefix',RPC,handler((method,body,signal)=>operations.track(operations.run(method,body,AbortSignal.any([signal,operations.signal]))),error=>ctx.logger.error(error)));
  register('exact',AGENT_EVENTS,(req,res)=>{
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const abort=new AbortController();res.once('close',()=>abort.abort());
   const signal=AbortSignal.any([abort.signal,operations.signal]);
   return operations.track((async()=>{
    const params=new URL(req.url??'','http://127.0.0.1').searchParams;
    const owner=ownerSchema.omit({nodeId:true}).parse(Object.fromEntries(params));
    if(!sameOwner(owner,await operations.resolve(owner.sessionId,signal)))throw new SketchError('SESSION_CHANGED','会话已变化',409);
    signal.throwIfAborted();operations.connect(owner,res);
   })().catch(error=>{if(!res.headersSent){res.writeHead(error instanceof SketchError?error.status:400);res.end('annotation stream unavailable');}}));
  });
  return dispose;
 }catch(error){dispose();throw error;}
}
