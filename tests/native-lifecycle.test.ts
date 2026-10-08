import {afterEach,expect,it,vi} from 'vitest';
import {SceneUpdates} from '../src/editor/scene-updates.ts';
import {Autosave} from '../src/editor/autosave.ts';
import {createPanelStore} from '../src/client/panel-store.ts';
import {rpc} from '../src/editor/rpc.ts';
import {RPC_LIMITS} from '../src/core/limits.ts';
import {createSceneExport} from '../src/editor/scene-export.ts';
import {mirrorHeader,HEADER} from '../src/client/header-adapter.tsx';
import type {Context} from '@deepseek-ai/cordis';
import {appearanceSchema} from '../src/core/appearance.ts';
import type {Drawing,Save} from '../src/core/contracts.ts';
const owner={sessionId:'native',createdAt:'1',cwd:'/workspace'},scene={elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}};
afterEach(()=>vi.useRealTimers());
it('ignores selection, theme and viewport changes but retains content and grid changes',()=>{
 vi.useFakeTimers();const apply=vi.fn(),updates=new SceneUpdates(apply),element={id:'a',version:1,versionNonce:1};
 updates.accept([element],{scrollX:0,theme:'light',gridSize:20});updates.flush();
 for(let i=0;i<100;i++)expect(updates.accept([element],{scrollX:i,theme:'dark',selectedElementIds:{a:true},gridSize:20})).toBe(false);
 expect(apply).toHaveBeenCalledTimes(1);
 updates.accept([{...element,version:2}],{gridSize:20});updates.accept([],{gridSize:20});vi.advanceTimersByTime(80);
 expect(apply).toHaveBeenLastCalledWith([],{gridSize:20});updates.accept([],{gridSize:10});updates.flush();expect(apply).toHaveBeenLastCalledWith([],{gridSize:10});updates.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('flushes the latest coalesced snapshot on teardown and accepts same-version replacement objects',()=>{
 vi.useFakeTimers();const apply=vi.fn(),updates=new SceneUpdates(apply),element={id:'a',version:1};
 updates.accept([element],{});updates.flush();expect(updates.accept([{...element}],{})).toBe(true);updates.dispose();expect(apply).toHaveBeenCalledTimes(2);expect(updates.accept([],{})).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('finishes newer edits after an in-flight save when navigating away',async()=>{
 const requests:Save[]=[];let finish!:(value:Drawing)=>void;
 const save=async(input:Save)=>{requests.push(input);const record={formatVersion:1,owner,revision:crypto.randomUUID(),mutationId:input.mutationId,sceneDigest:'s',contentDigest:'c',scene:input.scene,goal:input.goal,updatedAt:'now'} as Drawing;
  if(requests.length===1)return new Promise<Drawing>(resolve=>{finish=()=>resolve(record);});return record;
 };
 const queue=new Autosave(owner,null,save,()=>{},()=>{});queue.update({scene,goal:'first'});const first=queue.flush();queue.update({scene,goal:'latest'});
 const done=queue.shutdown();queue.update({scene,goal:'late unmounted event'});finish({} as Drawing);await first;await done;
 expect(requests.map(r=>r.goal)).toEqual(['first','latest']);expect(requests[1]?.expectedRevision).not.toBeNull();expect(queue.state).toBe('clean');
});
it('keeps panel generations separate, skips no-op notifications and drops removed sessions',()=>{
 const first=createPanelStore(),second=createPanelStore(),notify=vi.fn(),close=vi.fn();first.subscribe(notify);const initial=first.getSnapshot();first.set('a',false);expect(first.getSnapshot()).toBe(initial);
 first.set('a',true);first.set('a',true);expect(notify).toHaveBeenCalledTimes(1);expect(second.getSnapshot().a).toBeUndefined();first.onClose(close);first.requestClose('a');expect(close).toHaveBeenCalledWith('a');expect(first.getSnapshot().a).toBe(true);first.prune([]);expect(first.getSnapshot().a).toBeUndefined();first.clear();first.requestClose('a');expect(close).toHaveBeenCalledTimes(1);
});
it('accepts bounded native appearance and rejects injected CSS or unknown tokens',()=>{
 const base={theme:'dark',fontFamily:'system-ui',colors:{background:'#151517'}};expect(appearanceSchema.safeParse(base).success).toBe(true);
 expect(appearanceSchema.safeParse({...base,colors:{background:'url(https://external.test/font)'}}).success).toBe(false);expect(appearanceSchema.safeParse({...base,colors:{unknown:'#fff'}}).success).toBe(false);expect(appearanceSchema.safeParse({...base,fontFamily:'x; color:red'}).success).toBe(false);
});

it('caches just one immutable PNG snapshot, shares in-flight work and retries failures',async()=>{
 const blob=new Blob(['PNG']),exporter=vi.fn(async()=>blob),exportScene=createSceneExport(exporter);
 const first=exportScene(scene);expect(exportScene(scene)).toBe(first);expect(await first).toBe(blob);await exportScene(scene);expect(exporter).toHaveBeenCalledTimes(1);
 await exportScene({...scene});expect(exporter).toHaveBeenCalledTimes(2);
 const failed=vi.fn().mockRejectedValueOnce(new Error('export failed')).mockResolvedValue(blob),retry=createSceneExport(failed);
 await expect(retry(scene)).rejects.toThrow('export failed');expect(await retry(scene)).toBe(blob);expect(failed).toHaveBeenCalledTimes(2);
});
it('mirrors dynamic native header entries and releases all registrations and subscriptions',()=>{
 const sources=new Map<string,object[]>(),listeners=new Map<string,Set<()=>void>>(),active=new Set<object>();let cleanup!:()=>void;
 const slots={entries:(key:string)=>sources.get(key)??[],subscribe:(key:string,fn:()=>void)=>{const set=listeners.get(key)??new Set();set.add(fn);listeners.set(key,set);return()=>set.delete(fn);},register:(options:object)=>{active.add(options);return()=>active.delete(options);}};
 const entry={component:()=>null,options:{id:'official'},children:{'conversation.header.actions':{kind:'multi'}}};sources.set('conversation.header',[entry]);
 mirrorHeader({slots,effect:(effect:()=>()=>void)=>{cleanup=effect();}} as unknown as Context);
 expect([...active]).toMatchObject([{name:HEADER,id:'official'}]);expect(listeners.get('conversation.header.actions')?.size).toBe(1);
 const child={component:()=>null,options:{id:'late-plugin'}};sources.set('conversation.header.actions',[child]);for(const fn of listeners.get('conversation.header.actions')??[])fn();expect(active.size).toBe(2);
 sources.set('conversation.header',[]);for(const fn of listeners.get('conversation.header')??[])fn();expect(active.size).toBe(0);expect(listeners.get('conversation.header.actions')?.size).toBe(0);cleanup();expect(listeners.get('conversation.header')?.size).toBe(0);
});

it('keeps only bounded final save requests alive and measures UTF-8 bytes',async()=>{
 const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{const request=JSON.parse(init.body as string);return new Response(JSON.stringify({ok:true,requestId:request.requestId,value:null}));});vi.stubGlobal('fetch',fetcher);
 try{await rpc('drawing/save',owner,{},undefined,true);expect(fetcher.mock.calls[0]?.[1].keepalive).toBe(true);
 await rpc('drawing/save',owner,{text:'中'.repeat(RPC_LIMITS.keepaliveBodyBytes/2)},undefined,true);expect(fetcher.mock.calls[1]?.[1].keepalive).toBe(false);
 await rpc('advice/generate',owner,{},undefined,true);expect(fetcher.mock.calls[2]?.[1].keepalive).toBe(false);
 await rpc('drawing/save',owner,{});expect(fetcher.mock.calls[3]?.[1].keepalive).toBe(false);
 }finally{vi.unstubAllGlobals();}
});
