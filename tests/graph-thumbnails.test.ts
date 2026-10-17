import {expect,it,vi} from 'vitest';
import {GraphThumbnails} from '../src/editor/graph-thumbnails.ts';
import type {Drawing} from '../src/core/contracts.ts';

const revision=crypto.randomUUID();
function drawing(rev=revision):Drawing{return {owner:{sessionId:'a',createdAt:'1',cwd:'/a'},revision:rev,mutationId:crypto.randomUUID(),sceneDigest:revision,contentDigest:revision,formatVersion:1,updatedAt:new Date().toISOString(),goal:'',scene:{elements:[{id:'box',type:'rectangle',x:0,y:0,width:20,height:20}],appState:{},files:{}}};}
it('shares in-flight and rendered previews, including empty documents, by stable revision',async()=>{
 const load=vi.fn(async(id:string)=>id==='empty'?null:drawing()),render=vi.fn(async()=>({url:'blob:a',bounds:[0,0,20,20]})),revoke=vi.fn(),cache=new GraphThumbnails(load,render,revoke);
 const first=cache.get('root',revision);expect(cache.get('root',revision)).toBe(first);await first;await cache.get('root',revision);await cache.get('empty',null);await cache.get('empty',null);
 expect(load).toHaveBeenCalledTimes(2);expect(render).toHaveBeenCalledTimes(1);cache.dispose();expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('invalidates changed and deleted nodes without reloading unaffected drawings, and releases URLs',async()=>{
 let rev=revision;const load=vi.fn(async()=>drawing(rev)),revoke=vi.fn(),cache=new GraphThumbnails(load,async()=>({url:'blob:'+rev,bounds:[0,0,20,20]}),revoke);
 await cache.get('root',revision);await cache.get('child',revision);rev=crypto.randomUUID();cache.retain(new Map([['root',rev],['child',revision]]));await cache.get('root',rev);await cache.get('child',revision);expect(load).toHaveBeenCalledTimes(3);
 cache.retain(new Map([['child',revision]]));expect(revoke).toHaveBeenCalledTimes(2);cache.dispose();expect(revoke).toHaveBeenCalledTimes(3);
});
it('rejects stale revision metadata and retries failures; unknown revisions never reuse a cache entry',async()=>{
 const load=vi.fn(async()=>drawing()),cache=new GraphThumbnails(load,async()=>({url:'blob:a',bounds:[]}));
 await expect(cache.get('root',crypto.randomUUID())).rejects.toThrow('草图已变化');await cache.get('root',revision);await cache.get('root',undefined);await cache.get('root',undefined);expect(load).toHaveBeenCalledTimes(4);cache.dispose();
});
it('aborts disposed work, releases late renders, and isolates workspace instances',async()=>{
 let complete!:(value:{url:string;bounds:number[]})=>void;const revoke=vi.fn(),load=vi.fn(async()=>drawing()),cache=new GraphThumbnails(load,()=>new Promise(resolve=>{complete=resolve;}),revoke);
 const pending=cache.get('root',revision);await vi.waitFor(()=>expect(complete).toBeTypeOf('function'));cache.dispose();complete({url:'blob:late',bounds:[]});await expect(pending).rejects.toThrow();expect(revoke).toHaveBeenCalledWith('blob:late');
 const other=new GraphThumbnails(load,async()=>({url:'blob:other',bounds:[]}),revoke);await other.get('root',revision);expect(load).toHaveBeenCalledTimes(2);other.dispose();
});
it('bounds workspace cache entries and releases evicted images',async()=>{
 const load=vi.fn(async()=>drawing()),revoke=vi.fn(),cache=new GraphThumbnails(load,async()=>({url:'blob:'+load.mock.calls.length,bounds:[]}),revoke);
 for(let i=0;i<101;i++)await cache.get(String(i),revision);expect(revoke).toHaveBeenCalledTimes(1);await cache.get('0',revision);expect(load).toHaveBeenCalledTimes(102);cache.dispose();expect(revoke).toHaveBeenCalledTimes(102);
});
