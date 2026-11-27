import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import type {Context} from '@deepseek-ai/cordis';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {registerTransport,requestRejection} from '../src/host/transport.ts';
import {createEditorAssetsHandler} from '../src/host/static.ts';
import {ASSETS} from '../src/core/contracts.ts';

vi.mock('../src/host/static.ts',()=>({createEditorAssetsHandler:vi.fn(()=>vi.fn())}));
const req={method:'GET'} as IncomingMessage;
it('preserves legacy rejection and requires a live authenticated Peer on current hosts',()=>{
 expect(requestRejection({requestRejection:()=>403},req)).toBe(403);
 expect(requestRejection({requestRejection:()=>undefined},req)).toBeUndefined();
 const current={authentication:{authenticate:vi.fn()}},abort=new AbortController();
 expect(requestRejection(current,req)).toBe(401);
 expect(requestRejection(current,req,{signal:abort.signal})).toBeUndefined();abort.abort();expect(requestRejection(current,req,{signal:abort.signal})).toBe(401);
 const scoped=Object.defineProperty({},'authentication',{get(){throw Error('cannot get property without inject');}});
 expect(requestRejection(scoped,req,{signal:new AbortController().signal})).toBeUndefined();
 expect(requestRejection({},req)).toBe(503);expect(requestRejection({requestRejection:()=>true},req)).toBe(503);
 expect(current.authentication.authenticate).not.toHaveBeenCalled();
});
function fixture(failAt=0){
 const routes:Array<{path:string;auth:string;handler:(req:IncomingMessage,res:ServerResponse,peer?:{signal:AbortSignal})=>unknown}>=[],remove=vi.fn(),lifetime=new AbortController();
 const ctx={connection:{requestRejection:()=>undefined},logger:{error:vi.fn()},webServer:{register:(route:typeof routes[number])=>{if(routes.length===failAt-1)throw Error('registration failed');routes.push(route);return remove;}}} as unknown as Context;
 const operations={root:'/fixture',signal:lifetime.signal,run:vi.fn(async()=>null),resolve:vi.fn(async()=>({sessionId:'s',createdAt:'1',cwd:'/w'})),connect:vi.fn(),track:<T>(task:Promise<T>)=>task};
 return {ctx,routes,remove,lifetime,operations};
}
it('constructs the asset handler once, owns all route removals and rejects calls after disposal begins',()=>{
 vi.mocked(createEditorAssetsHandler).mockClear();const f=fixture(),dispose=registerTransport(f.ctx,f.operations);
 expect(f.routes.map(route=>route.auth)).toEqual(['required','required','required']);
 const route=f.routes.find(route=>route.path===ASSETS)!,response=Object.assign(new EventEmitter(),{writeHead:vi.fn(),end:vi.fn()}) as unknown as ServerResponse;
 route.handler(req,response);route.handler(req,response);expect(createEditorAssetsHandler).toHaveBeenCalledExactlyOnceWith('/fixture');
 f.lifetime.abort();route.handler(req,response);expect(response.writeHead).toHaveBeenCalledWith(503);
 dispose();dispose();expect(f.remove).toHaveBeenCalledTimes(3);
});
it('rolls back earlier registrations when a later route fails',()=>{
 const f=fixture(2);expect(()=>registerTransport(f.ctx,f.operations)).toThrow('registration failed');expect(f.remove).toHaveBeenCalledOnce();
});
