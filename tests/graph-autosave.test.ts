import {afterEach,expect,it,vi} from 'vitest';
import {GraphAutosave} from '../src/editor/graph-autosave.ts';
import {GraphRecovery,type GraphPending} from '../src/editor/graph-recovery.ts';
import {initialGraph,type SketchGraph} from '../src/core/graph.ts';
import type {Owner} from '../src/core/contracts.ts';

const owner:Owner={sessionId:'graph-queue',createdAt:'123',cwd:'/project'};
function memoryStorage(){const rows=new Map<string,string>();return {getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{rows.set(key,value);},removeItem:(key:string)=>{rows.delete(key);}};}
function graph(request:GraphPending['request']):SketchGraph{return {owner,formatVersion:1,revision:crypto.randomUUID(),mutationId:request.mutationId,updatedAt:new Date().toISOString(),content:request.content};}
function fixture(tab:string,transport?:((request:GraphPending['request'])=>Promise<SketchGraph>)){
 const recovery=new GraphRecovery(owner,tab),save=vi.fn(transport??(async request=>graph(request))),changed=vi.fn();
 const queue=new GraphAutosave({write:r=>recovery.writePending(r),clear:id=>recovery.clearPending(id),save,saved:()=>{},changed});queue.reset(null);
 return {recovery,save,changed,queue};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('coalesces continuous layout changes and flushes the final state immediately on navigation',async()=>{
 vi.useFakeTimers();vi.stubGlobal('localStorage',memoryStorage());const {queue,save}=fixture('a');
 for(let i=0;i<30;i++){const c=initialGraph();c.nodes[0]!.position.x=i;c.viewport={x:i,y:i*2,zoom:1+i/100};queue.update(c);await vi.advanceTimersByTimeAsync(10);}
 expect(save).not.toHaveBeenCalled();await queue.flush();expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0]![0].content.viewport.zoom).toBe(1.29);expect(save.mock.calls[0]![0].content.nodes[0]!.position.x).toBe(29);queue.dispose();
});
it('serializes a slow save and merges newer drag, pan and zoom without overwriting them on acknowledgement',async()=>{
 vi.stubGlobal('localStorage',memoryStorage());let release!:(value:SketchGraph)=>void;
 const {queue,save,recovery,changed}=fixture('a',request=>save.mock.calls.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(graph(request)));
 const first=initialGraph();queue.update(first);const flight=queue.flush();
 for(let i=1;i<=20;i++)queue.update({...first,nodes:[{...first.nodes[0]!,position:{x:i,y:i}}],viewport:{x:i,y:i,zoom:2}});
 expect(save).toHaveBeenCalledTimes(1);expect(recovery.readPending()?.next?.viewport.x).toBe(20);
 const ack=graph(save.mock.calls[0]![0]);release(ack);await flight;
 expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[1]![0].expectedRevision).toBe(ack.revision);expect(save.mock.calls[1]![0].content.nodes[0]!.position.x).toBe(20);expect(recovery.readPending()).toBeNull();expect(changed.mock.calls.at(-1)?.[0]).toBe('clean');queue.dispose();
});
it('keeps interleaved tabs separate and clears only the matching mutation',async()=>{
 vi.stubGlobal('localStorage',memoryStorage());const a=fixture('a'),b=fixture('b');a.queue.update(initialGraph());b.queue.update(initialGraph());
 const old=a.recovery.readPending()!,other=b.recovery.readPending()!;await a.queue.flush();expect(b.recovery.readPending()).toEqual(other);
 a.queue.update({...initialGraph(),viewport:{x:17,y:0,zoom:1}});a.recovery.clearPending(old.request.mutationId);expect(a.recovery.readPending()).not.toBeNull();a.queue.dispose();b.queue.dispose();
});
it('retains a conflict across refresh without consuming the other tab recovery',async()=>{
 vi.stubGlobal('localStorage',memoryStorage());const a=fixture('a',async()=>{throw Error('REVISION_CONFLICT');}),b=fixture('b');
 a.queue.update(initialGraph());b.queue.update({...initialGraph(),viewport:{x:9,y:0,zoom:1}});await expect(a.queue.flush()).rejects.toThrow('REVISION_CONFLICT');
 const pending=a.recovery.readPending()!,fresh=fixture('a');fresh.queue.reset(null,new GraphRecovery(owner,'a').readPending());await fresh.queue.retry();
 expect(fresh.save.mock.calls[0]![0].mutationId).toBe(pending.request.mutationId);expect(a.recovery.readPending()).toBeNull();expect(b.recovery.readPending()).not.toBeNull();for(const f of [a,b,fresh])f.queue.dispose();
});
it('refreshes an unacknowledged request plus newer layout by replaying the same request before the latest state',async()=>{
 vi.stubGlobal('localStorage',memoryStorage());let reject!:(reason:Error)=>void;
 const old=fixture('a',()=>new Promise((_resolve,no)=>{reject=no;}));old.queue.update(initialGraph());const failed=old.queue.flush();old.queue.update({...initialGraph(),viewport:{x:42,y:0,zoom:2}});reject(Error('offline'));await expect(failed).rejects.toThrow('offline');
 const record=old.recovery.readPending()!,fresh=fixture('a');fresh.queue.reset(null,record);await fresh.queue.retry();expect(fresh.save).toHaveBeenCalledTimes(2);expect(fresh.save.mock.calls[0]![0]).toEqual(record.request);expect(fresh.save.mock.calls[1]![0].content.viewport.x).toBe(42);old.queue.dispose();fresh.queue.dispose();
});
it('leaves replacement legacy mutations intact when clearing an older recovery',()=>{
 const storage=memoryStorage();vi.stubGlobal('localStorage',storage);const a=fixture('a');a.queue.update(initialGraph());const old=a.recovery.readPending()!;
 const legacy=a.recovery.pendingKey.split(':tab:')[0]!;storage.setItem(legacy,JSON.stringify({...old.request,mutationId:crypto.randomUUID()}));a.recovery.clearPending(old.request.mutationId);expect(storage.getItem(legacy)).not.toBeNull();a.queue.dispose();
});
it('checkpoints continuous layout at bounded intervals instead of serializing each frame',async()=>{
 vi.useFakeTimers();const write=vi.fn(),save=vi.fn(async(request:GraphPending['request'])=>graph(request)),changed=vi.fn();
 const queue=new GraphAutosave({write,clear:()=>{},save,saved:()=>{},changed});queue.reset(graph({expectedRevision:null,mutationId:crypto.randomUUID(),content:initialGraph()}));
 for(let i=1;i<=120;i++){queue.stageLayout({...initialGraph(),viewport:{x:i,y:0,zoom:1}});await vi.advanceTimersByTimeAsync(16);}
 expect(save).not.toHaveBeenCalled();queue.checkpointLayout();await queue.flush();
 expect(write.mock.calls.length).toBeLessThanOrEqual(5);expect(save.mock.calls.at(-1)?.[0].content.viewport.x).toBe(120);expect(changed.mock.calls.filter(c=>c[0]==='dirty').length).toBeLessThan(12);queue.dispose();
});
it('flushes the latest staged layout on navigation and checkpoints on disposal without starting a request',async()=>{
 vi.useFakeTimers();vi.stubGlobal('localStorage',memoryStorage());const a=fixture('a');a.queue.stageLayout({...initialGraph(),viewport:{x:42,y:0,zoom:2}});await a.queue.flush();expect(a.save.mock.calls[0]?.[0].content.viewport.x).toBe(42);
 a.queue.stageLayout({...initialGraph(),viewport:{x:73,y:0,zoom:2}});a.queue.dispose();expect(a.recovery.readPending()?.request.content.viewport.x).toBe(73);await vi.advanceTimersByTimeAsync(1000);expect(a.save).toHaveBeenCalledTimes(1);
});
it('does not lose staged layout on a slow acknowledgement or failed request',async()=>{
 vi.useFakeTimers();vi.stubGlobal('localStorage',memoryStorage());let release!:(v:SketchGraph)=>void;
 const a=fixture('a',r=>a.save.mock.calls.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(graph(r)));
 a.queue.update(initialGraph());const flight=a.queue.flush();a.queue.stageLayout({...initialGraph(),viewport:{x:88,y:0,zoom:2}});release(graph(a.save.mock.calls[0]![0]));await flight;expect(a.save.mock.calls.at(-1)?.[0].content.viewport.x).toBe(88);expect(a.recovery.readPending()).toBeNull();a.queue.dispose();
 const b=fixture('b',async()=>{throw Error('offline');});b.queue.update(initialGraph());const failed=b.queue.flush();b.queue.stageLayout({...initialGraph(),viewport:{x:99,y:0,zoom:2}});await expect(failed).rejects.toThrow('offline');expect(b.recovery.readPending()?.next?.viewport.x).toBe(99);expect(()=>b.queue.stageLayout(initialGraph())).toThrow('offline');b.queue.dispose();
});
it('retains staged content when recovery storage fails and retries before contacting the server',async()=>{
 vi.useFakeTimers();const write=vi.fn().mockImplementationOnce(()=>{throw Error('quota');}),save=vi.fn(async(request:GraphPending['request'])=>graph(request));
 const queue=new GraphAutosave({write,clear:()=>{},save,saved:()=>{},changed:()=>{}});queue.stageLayout({...initialGraph(),viewport:{x:64,y:0,zoom:1}});expect(()=>queue.checkpointLayout()).toThrow('quota');expect(save).not.toHaveBeenCalled();await queue.retry();expect(save.mock.calls[0]?.[0].content.viewport.x).toBe(64);expect(write).toHaveBeenCalledTimes(2);queue.dispose();
});
it('returns to clean without a write when a gesture ends at its original position',async()=>{
 const write=vi.fn(),save=vi.fn(async(request:GraphPending['request'])=>graph(request)),changed=vi.fn(),queue=new GraphAutosave({write,clear:()=>{},save,saved:()=>{},changed});
 const c=initialGraph();queue.reset(graph({expectedRevision:null,mutationId:crypto.randomUUID(),content:c}));queue.stageLayout({...c,viewport:{...c.viewport,x:99}});queue.stageLayout(c);await queue.flush();expect(write).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(changed.mock.calls.at(-1)?.[0]).toBe('clean');queue.dispose();
});
it('rejects invalid layout coordinates before accepting them and can still save the last valid layout',async()=>{
 vi.stubGlobal('localStorage',memoryStorage());const {queue,save}=fixture('a'),valid={...initialGraph(),viewport:{x:42,y:0,zoom:1}};queue.stageLayout(valid);
 for(const viewport of [{x:100001,y:0,zoom:1},{x:0,y:NaN,zoom:1},{x:0,y:0,zoom:5}])expect(()=>queue.stageLayout({...valid,viewport})).toThrow();
 expect(()=>queue.stageLayout({...valid,nodes:[{...valid.nodes[0]!,position:{x:Infinity,y:0}}]})).toThrow();await queue.flush();expect(save.mock.calls[0]?.[0].content).toEqual(valid);queue.dispose();
});
