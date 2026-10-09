import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import type {ImageAttachmentRef} from '@deepseek-ai/dsh-attachment';
import type {SessionHeader} from '@deepseek-ai/dsh-session';
import {VisualRepository} from '../src/host/visual-repository.ts';
import {Repository} from '../src/host/repository.ts';
import {SketchAgent} from '../src/host/agent.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import {createSketchTools} from '../src/host/tools.ts';
import {VISUAL_LIMITS,visualPrepareSchema,visualReadSchema,type VisualRecord} from '../src/core/visual.ts';
import {canonical,type Owner,type Drawing} from '../src/core/contracts.ts';
import {createSceneExport} from '../src/editor/scene-export.ts';
import {requestBodyLimit,RPC_LIMITS} from '../src/core/limits.ts';

const owner:Owner={sessionId:'visual',createdAt:'1',cwd:'/test'},session={id:owner.sessionId,createdAt:1,cwd:owner.cwd} as unknown as SessionHeader;
function memory<T>(){const rows=new Map<string,T>();return {rows,table:{get:(k:string)=>rows.get(k),put:async(k:string,v:T)=>{rows.set(k,structuredClone(v));},entries:()=>rows.entries(),get size(){return rows.size;}} as unknown as KvTable<string,T>};}
async function setup(){
 const drawings=new Repository(memory<Drawing>().table),drawing=await drawings.save(owner,{expectedRevision:null,mutationId:randomUUID(),goal:'自由手绘解释',scene:{elements:[{id:'r',type:'rectangle',x:10,y:20,width:80,height:60},{id:'other',type:'freedraw',x:200,y:20,width:30,height:30,points:[[0,0],[30,30]]}],appState:{viewBackgroundColor:'#ffffff'},files:{}}},async()=>{});
 const store=memory<VisualRecord>(),ref={attachmentId:'native-image',mediaType:'image/png',bytes:40,width:100,height:100} as ImageAttachmentRef;
 const attachments={saveImage:vi.fn(async()=>ref),readImage:vi.fn(async()=>({ref,data:new Uint8Array([1])}))},visual=new VisualRepository(store.table,attachments);
 const check=vi.fn(async()=>{}),signal=new AbortController().signal;
 const prepare=(scope:'all'|'focus'='all',focus:{revision:string;elementIds:string[]}|null=null)=>visual.prepare(owner,drawing,scope,focus,new Uint8Array([1]),check);
 return {drawings,drawing,store,ref,attachments,visual,check,signal,prepare};
}
it('accepts only bounded revision/scoped explicit PNG preparation, no model-supplied paths or references',()=>{
 const args={revision:randomUUID(),pngBase64:'AQ=='};expect(visualPrepareSchema.parse(args).scope).toBe('all');
 expect(visualPrepareSchema.safeParse({...args,attachmentId:'forged'}).success).toBe(false);expect(visualReadSchema.safeParse({scope:'all'}).success).toBe(false);
 expect(requestBodyLimit('visual/prepare')).toBe(RPC_LIMITS.adviceBodyBytes);expect(requestBodyLimit('visual/get')).toBe(RPC_LIMITS.envelopeBytes);
});
it('stores native references, deduplicates exports, restores after reinitialization and preserves drawings',async()=>{
 const s=await setup(),before=canonical(s.drawings.get(owner));await s.prepare();await s.prepare();expect(s.attachments.saveImage).toHaveBeenCalledTimes(1);
 const restarted=new VisualRepository(s.store.table,s.attachments),value=await restarted.read(owner,s.drawing,'all',null,s.signal,s.check);
 expect(value).toMatchObject({revision:s.drawing.revision,scope:'all',image:{attachmentId:'native-image'}});expect(JSON.stringify(value)).not.toContain('base64');expect(canonical(s.drawings.get(owner))).toBe(before);
});
it('rejects missing/stale images and exact session or workspace changes without leaking an image',async()=>{
 const s=await setup();await expect(s.visual.read(owner,s.drawing,'all',null,s.signal,s.check)).rejects.toMatchObject({code:'VISUAL_NOT_PREPARED'});await s.prepare();
 for(const changed of [{createdAt:'2'},{cwd:'/other'},{sessionId:'else'}])await expect(s.visual.read({...owner,...changed},s.drawing,'all',null,s.signal,s.check)).rejects.toMatchObject({code:'VISUAL_NOT_PREPARED'});
 await expect(s.visual.read(owner,{...s.drawing,revision:randomUUID()},'all',null,s.signal,s.check)).rejects.toMatchObject({code:'VISUAL_STALE'});
 await expect(s.visual.read(owner,{...s.drawing,sceneDigest:'changed'},'all',null,s.signal,s.check)).rejects.toMatchObject({code:'VISUAL_STALE'});expect(s.attachments.readImage).not.toHaveBeenCalled();
});
it('binds a focus image to exact selected IDs and revision, retaining full image independently',async()=>{
 const s=await setup(),focus={revision:s.drawing.revision,elementIds:['r']};await s.prepare();await s.prepare('focus',focus);
 expect(await s.visual.read(owner,s.drawing,'focus',focus,s.signal,s.check)).toMatchObject({scope:'focus',elementIds:['r']});expect(s.visual.status(owner,s.drawing,focus)).toMatchObject({all:{stale:false},focus:{stale:false}});
 const changed={...focus,elementIds:['other']};expect(s.visual.status(owner,s.drawing,changed).focus?.stale).toBe(true);await expect(s.visual.read(owner,s.drawing,'focus',changed,s.signal,s.check)).rejects.toMatchObject({code:'VISUAL_STALE'});
 await expect(s.prepare('focus',null)).rejects.toMatchObject({code:'FOCUS_STALE'});await expect(s.prepare('focus',{...focus,elementIds:['missing']})).rejects.toMatchObject({code:'FOCUS_STALE'});
 expect(s.visual.status(owner,s.drawing,null).all?.stale).toBe(false);expect(s.visual.status(owner,s.drawing,null).focus?.stale).toBe(true);
});
it('does not publish a reference if the version/lifecycle changes during admission or on metadata failure',async()=>{
 const s=await setup();let live=true;s.attachments.saveImage.mockImplementationOnce(async()=>{live=false;return s.ref;});
 await expect(s.visual.prepare(owner,s.drawing,'all',null,new Uint8Array([1]),async()=>{if(!live)throw new Error('changed');})).rejects.toThrow('changed');expect(s.store.rows.size).toBe(0);
 s.store.table.put=async()=>{throw new Error('metadata failure');};await expect(s.prepare()).rejects.toThrow('metadata failure');expect(s.visual.status(owner,s.drawing,null).all).toBeNull();
});
it('fails closed when image verification fails or a read is cancelled, retaining stored drafts',async()=>{
 const s=await setup();await s.prepare();s.attachments.readImage.mockRejectedValueOnce(new Error('image unavailable'));
 await expect(s.visual.read(owner,s.drawing,'all',null,s.signal,s.check)).rejects.toThrow('image unavailable');const abort=new AbortController();abort.abort();
 await expect(s.visual.read(owner,s.drawing,'all',null,abort.signal,s.check)).rejects.toThrow();expect(s.drawings.get(owner)).toEqual(s.drawing);
});
it('bounds reference records before native attachment writes',async()=>{
 const s=await setup();for(let i=0;i<VISUAL_LIMITS.records;i++)s.store.rows.set('fake-'+i,{} as VisualRecord);
 await expect(s.prepare()).rejects.toMatchObject({code:'STORAGE_FULL'});expect(s.attachments.saveImage).not.toHaveBeenCalled();
});
it('uses a native image tool with a route gate and exact Agent ownership, without apply or extra model calls',async()=>{
 const s=await setup();await s.prepare();const agent=new SketchAgent({snapshot:async()=>({owner,drawing:s.drawing}),check:async()=>{},changed:()=>{}},new CommentRepository(memory().table as never),undefined,s.visual);
 const gate=vi.fn(async()=>{}),tools=createSketchTools(agent,s.signal,p=>p,gate),tool=tools.find(t=>t.name==='sketch_read_image')!;
 const exec={signal:s.signal,callId:'image',agent:{session:{header:session}}} as Parameters<typeof tool.execute>[1];
 const value=await tool.execute({revision:s.drawing.revision},exec);expect(gate).toHaveBeenCalledTimes(1);expect(tool.output.render({},JSON.parse(JSON.stringify(value)))).toMatchObject([{type:'text'},{type:'image',attachment:{attachmentId:'native-image'}}]);
 expect(await agent.read(session,{},s.signal)).toMatchObject({image:{prepared:true,included:false}});expect(agent.measurements[0]).toMatchObject({tool:'sketch_read_image',inputTokens:null});
 gate.mockRejectedValueOnce(new Error('text-only route'));const before=s.attachments.readImage.mock.calls.length;await expect(tool.execute({revision:s.drawing.revision},exec)).rejects.toThrow('text-only route');expect(s.attachments.readImage.mock.calls.length).toBe(before);
 await expect(tool.execute({revision:s.drawing.revision},{...exec,agent:undefined} as never)).rejects.toThrow('owning Agent');expect(tools.some(t=>t.name==='sketch_apply')).toBe(false);
});
it('reuses full and bounded selection exports, excludes unrelated elements and retries failed exports',async()=>{
 const s=await setup(),exporter=vi.fn(async(_scene:Drawing['scene'])=>new Blob(['PNG'])),exportScene=createSceneExport(exporter);
 await exportScene(s.drawing.scene);await exportScene(s.drawing.scene,['r']);await exportScene(s.drawing.scene,['r']);await exportScene(s.drawing.scene);expect(exporter).toHaveBeenCalledTimes(2);expect(exporter.mock.calls[1]?.[0]?.elements.map(e=>e.id)).toEqual(['r']);
 await expect(exportScene(s.drawing.scene,['missing'])).rejects.toThrow('已变化');await exportScene(s.drawing.scene,['other']);await exportScene(s.drawing.scene,['r']);expect(exporter).toHaveBeenCalledTimes(4);
});

it('bounds image-tool metadata for escaped long focus IDs while retaining the actual image',async()=>{
 const s=await setup(),drawing={...s.drawing,scene:{...s.drawing.scene,elements:Array.from({length:50},(_,i)=>({id:String(i)+'\u0001'.repeat(250),type:'rectangle' as const,x:i,y:0,width:10,height:10}))}},focus={revision:drawing.revision,elementIds:drawing.scene.elements.map(e=>e.id)};
 await s.visual.prepare(owner,drawing,'focus',focus,new Uint8Array([1]),s.check);const value=await s.visual.read(owner,drawing,'focus',focus,s.signal,s.check);
 expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(16*1024);expect(value).toMatchObject({elementCount:50,elementIdsTruncated:true,elementIds:[],image:{attachmentId:'native-image'}});expect(s.drawing.scene.elements).toHaveLength(2);
});
