import {expect,it} from 'vitest';
import {SketchService} from '../src/host/service.ts';
import {ownerKey,type Owner} from '../src/core/contracts.ts';

const original={id:'session',createdAt:'123',cwd:'/original'};
const owner:Owner={sessionId:original.id,createdAt:original.createdAt,cwd:original.cwd};
const methods=SketchService.prototype as unknown as {
 resolve(id:string,signal:AbortSignal):Promise<Owner>;
 checkAgent(owner:Owner,revision:string|null,signal:AbortSignal):Promise<void>;
};

it.each(['alpha.1','alpha.2'])('retains the original draft owner through %s directory changes and persisted reopening',async version=>{
 // alpha.2 keeps header.cwd immutable and projects its effective cwd separately.
 // Changing the storage owner to that projection would orphan existing drafts.
 let live:{header:typeof original}|undefined={header:original},effective='/worktree',reads=0;
 const carrier={sessions:{get:()=>live},ctx:{
  sessionPersistence:{stat:async()=>{reads++;effective='/different-worktree';return {header:original};}},
  ...(version==='alpha.2'?{workingDirectory:{get:()=>effective},sessionProjections:{stateOf:()=>effective}}:{}),
 }};
 const signal=new AbortController().signal;
 expect(await methods.resolve.call(carrier,owner.sessionId,signal)).toEqual(owner);
 expect(ownerKey(await methods.resolve.call(carrier,owner.sessionId,signal))).toBe(ownerKey(owner));
 live=undefined;
 expect(await methods.resolve.call(carrier,owner.sessionId,signal)).toEqual(owner);
 expect(reads).toBe(3);
});

it('rejects an old owner when the same session id is replaced, without reading or mutating its draft',async()=>{
 let accessed=false;
 const carrier={sessions:{get:()=>({header:{...original,createdAt:'new'}})},ctx:{sessionPersistence:{stat:async()=>({header:original})}},
  repository:{get:()=>{accessed=true;return null;}},resolve:methods.resolve,
 };
 await expect(methods.checkAgent.call(carrier,owner,null,new AbortController().signal)).rejects.toMatchObject({code:'SESSION_CHANGED'});
 expect(accessed).toBe(false);
});

it('keeps missing-session and cancelled requests from accessing a saved drawing',async()=>{
 let reads=0;
 const carrier={sessions:{get:()=>undefined},ctx:{sessionPersistence:{stat:async()=>{reads++;return undefined;}}}};
 await expect(methods.resolve.call(carrier,owner.sessionId,new AbortController().signal)).rejects.toMatchObject({code:'SESSION_CHANGED'});
 const abort=new AbortController();abort.abort();
 await expect(methods.resolve.call(carrier,owner.sessionId,abort.signal)).rejects.toThrow();
 expect(reads).toBe(1);
});
