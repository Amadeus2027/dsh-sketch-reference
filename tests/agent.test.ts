import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import type {SessionHeader} from '@deepseek-ai/dsh-session';
import {SketchAgent,describeDrawing} from '../src/host/agent.ts';
import {createSketchTools} from '../src/host/tools.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import {agentBatchSchema,agentReadSchema,agentAnnotateSchema,AGENT_LIMITS,type AgentBatch} from '../src/core/agent.ts';
import {ownerKey,contentDigest,canonical,SketchError,drawingSchema,type Owner,type Drawing} from '../src/core/contracts.ts';
import type {VisualRepository} from '../src/host/visual-repository.ts';
import type {EditRepository} from '../src/host/edit-repository.ts';
import {commentReference} from '../src/core/comment-context.ts';
import type {Batch} from '../src/core/contracts.ts';

const owner:Owner={sessionId:'session',createdAt:'123',cwd:'/workspace'};
const session={id:owner.sessionId,createdAt:123,cwd:owner.cwd} as unknown as SessionHeader;
async function setup(visual?:VisualRepository,analysis?:()=>Batch|null,edits?:EditRepository){
 const scene:Drawing['scene']={elements:[{id:'rect',type:'rectangle',x:20,y:40,width:100,height:80,customData:{secret:'NO_LEAK'}},{id:'text',type:'text',x:20,y:40,width:90,height:25,text:'三角形内角和',containerId:'rect'},{id:'free',type:'freedraw',x:300,y:30,width:50,height:50,points:[[0,0],[50,50]]},{id:'deleted',type:'ellipse',x:0,y:0,width:80,height:80,isDeleted:true}],appState:{viewBackgroundColor:'#fff'},files:{}};
 let drawing:Drawing|null={formatVersion:1,owner,revision:randomUUID(),mutationId:randomUUID(),sceneDigest:'scene',contentDigest:await contentDigest(scene),scene,goal:'解释几何关系',updatedAt:new Date().toISOString()};
 let liveOwner=owner,notifications=0,writes=0;
 const rows=new Map<string,AgentBatch>();
 const table={get:(k:string)=>rows.get(k),put:async(k:string,v:AgentBatch)=>{rows.set(k,structuredClone(v));writes++;},update:async(k:string,f:(v:AgentBatch)=>AgentBatch)=>{const v=f(rows.get(k)!);rows.set(k,structuredClone(v));writes++;return v;},get size(){return rows.size;}} as unknown as KvTable<string,AgentBatch>;
 const check=async(o:Owner,revision:string|null,signal:AbortSignal)=>{signal.throwIfAborted();if(ownerKey(o)!==ownerKey(liveOwner))throw new SketchError('SESSION_CHANGED','changed');if(revision&&revision!==drawing?.revision)throw new SketchError('REVISION_CONFLICT','changed');};
 const agent=new SketchAgent({snapshot:async(s,signal)=>{const o={sessionId:String(s.id),createdAt:String(s.createdAt),cwd:s.cwd??''};await check(o,null,signal);return {owner:o,drawing};},check,changed:()=>{notifications++;},...(analysis?{analysis}:{} )},new CommentRepository(table),edits,visual);
 const input=()=>({revision:drawing!.revision,expectedBatchId:agent.comments.get(owner)?.id??null,summary:'几何解释',comments:[{title:'内角和',reason:'欧氏平面三角形的内角和为 180°。',anchor:{type:'element',elementId:'rect'}}]});
 const signal=new AbortController().signal;
 return {agent,rows,input,signal,read:()=>agent.read(session,{},signal),drawing:()=>drawing!,setDrawing:(v:Drawing|null)=>{drawing=v;},setOwner:(o:Owner)=>{liveOwner=o;},stats:()=>({notifications,writes})};
}
it('reads a saved compact snapshot without editor, image export or an LLM',async()=>{
 const s=await setup(),result=await s.read();expect(result).toMatchObject({revision:s.drawing().revision,totalElements:3,types:{rectangle:1,text:1,freedraw:1},image:{included:false,requiredForFreehand:true},annotations:null});
 expect(JSON.stringify(result)).not.toContain('NO_LEAK');expect(JSON.stringify(result)).not.toContain('deleted');expect(result).not.toHaveProperty('owner');
 await s.read();expect(s.agent.measurements[1]).toMatchObject({cacheHit:true,inputTokens:null});expect(s.stats().writes).toBe(0);
});
it('describes an applied proposal as history when the current drawing has changed',async()=>{
 const historical={id:randomUUID(),status:'applied',baseRevision:randomUUID(),operations:[{op:'move',elementId:'rect',x:60,y:40}]};
 const s=await setup(undefined,undefined,{get:()=>historical} as unknown as EditRepository);
 const value=await s.read();
 expect(value).toMatchObject({revision:s.drawing().revision,proposal:{status:'applied',stale:true,statusInstruction:'applied 仅表示历史上曾应用，可能已撤销或继续编辑；当前状态以本次读取的草图为准。'}});
 expect(s.stats().writes).toBe(0);
});
it('resolves an exact short comment reference in the existing read tool without scene writes',async()=>{
 const s=await setup();await s.agent.annotate(session,s.input(),'ref',s.signal);
 const batch=s.agent.comments.get(owner)!,reference=await commentReference(s.drawing(),batch,'agent',batch.comments[0]!.id),before=canonical(s.drawing()),writes=s.stats().writes;
 const value=await s.agent.read(session,{commentReference:reference},s.signal);
 expect(value).toMatchObject({discussion:{reference,elementId:'rect',title:'内角和'}});
 expect(await s.read()).not.toHaveProperty('discussion');expect(s.stats().writes).toBe(writes);expect(canonical(s.drawing())).toBe(before);
 s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:['free']},s.drawing());
 await expect(s.agent.read(session,{commentReference:reference},s.signal)).rejects.toMatchObject({code:'COMMENT_UNAVAILABLE'});
 s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:[]},s.drawing());s.setDrawing({...s.drawing(),revision:randomUUID()});
 await expect(s.agent.read(session,{commentReference:reference},s.signal)).rejects.toMatchObject({code:'COMMENT_UNAVAILABLE'});
});
it('also resolves legacy analysis comments independently of Agent annotations',async()=>{
 let analysis:Batch|null=null;const s=await setup(undefined,()=>analysis);
 analysis={id:randomUUID(),owner,createdAt:new Date().toISOString(),contentDigest:s.drawing().contentDigest,goal:s.drawing().goal,route:{provider:'deepseek-official',model:'deepseek-flash'},advice:{summary:'分析',suggestions:[{kind:'clarify',title:'相同标题',reason:'来自分析入口',actionPrompt:'说明',anchor:{type:'element',elementId:'text'}}]}};
 const {withComments}=await import('../src/core/comments.ts');const current=withComments(analysis),reference=await commentReference(s.drawing(),current,'analysis',current.comments[0]!.id);
 expect(await s.agent.read(session,{commentReference:reference},s.signal)).toMatchObject({discussion:{reference,elementId:'text',reason:'来自分析入口'}});
});
it('supports revision-bound IDs and compact binding relationships without arbitrary metadata',async()=>{
 const s=await setup(),result=await s.agent.read(session,{mode:'elements',revision:s.drawing().revision,elementIds:['text']},s.signal);
 expect(result).toMatchObject({elements:[{id:'text',text:'三角形内角和',containerId:'rect',x:20,y:40}]});
 await expect(s.agent.read(session,{mode:'elements',revision:s.drawing().revision,elementIds:['deleted']},s.signal)).rejects.toMatchObject({code:'ELEMENT_NOT_FOUND'});
 expect(agentReadSchema.safeParse({mode:'elements',elementIds:['rect']}).success).toBe(false);
});
it('does not reuse the first summary page for a progressive read at another offset',async()=>{
 const s=await setup(),first=await s.read();
 const next=await s.agent.read(session,{revision:s.drawing().revision,offset:1},s.signal);
 expect(first).toMatchObject({elements:[{id:'rect'},{id:'text'},{id:'free'}]});
 expect(next).toMatchObject({elements:[{id:'text'},{id:'free'}]});expect(s.agent.measurements[1]?.cacheHit).toBe(false);
 expect(await s.read()).toEqual(first);expect(s.agent.measurements[2]?.cacheHit).toBe(true);
});
it('provides pagination and exact byte budgets for hostile-sized Unicode scenes',async()=>{
 const s=await setup(),drawing={...s.drawing(),goal:'😀'.repeat(2000),scene:{...s.drawing().scene,elements:Array.from({length:2000},(_,i)=>({id:String(i).padEnd(256,'x'),type:'text' as const,x:0,y:0,width:100,height:20,text:'😀'.repeat(4000)}))}};
 s.setDrawing(drawing);
 for(const mode of ['summary','elements'] as const){const result:Record<string,unknown>=await s.agent.read(session,{mode},s.signal);expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(mode==='summary'?AGENT_LIMITS.summaryBytes:AGENT_LIMITS.detailBytes);expect(result.truncated).toBe(true);expect(Number(result.nextOffset)).toBeGreaterThan(0);const next=describeDrawing(drawing,agentReadSchema.parse({mode,offset:result.nextOffset}));expect((next.elements as {id:string}[])[0]?.id).not.toBe((result.elements as {id:string}[])[0]?.id);}
});
it('adds element and global comments, downgrades unknown/deleted IDs and never writes the scene',async()=>{
 const s=await setup(),before=canonical(s.drawing()),input={...s.input(),comments:[s.input().comments[0],{title:'整体',reason:'需要图片才能识别物品。'},{title:'失效目标',reason:'保留说明。',anchor:{type:'element',elementId:'deleted'}}]};
 const result=await s.agent.annotate(session,input,'call-1',s.signal),stored=s.agent.comments.get(owner)!;
 expect(result).toMatchObject({count:3,unanchored:2});expect(stored.advice.suggestions[0]?.anchor?.elementId).toBe('rect');expect(stored.advice.suggestions[2]?.anchor).toBeUndefined();expect(agentBatchSchema.safeParse(stored).success).toBe(true);expect(canonical(s.drawing())).toBe(before);
 expect(stored).not.toHaveProperty('route');expect(stored.advice.suggestions[0]).not.toHaveProperty('actionPrompt');expect(s.stats().notifications).toBe(1);
 const read=await s.read();expect(read).toMatchObject({annotations:{items:[{title:'内角和',status:'open'},{title:'整体'},{title:'失效目标'}]}});
});
it('bounds combined annotation metadata and still advances pagination with escaped text',async()=>{
 const s=await setup(),control='\u0001',drawing={...s.drawing(),goal:control.repeat(2000),scene:{...s.drawing().scene,elements:Array.from({length:2000},(_,i)=>({id:String(i).padEnd(256,control),type:'text' as const,x:0,y:0,width:100,height:20,text:control.repeat(4000)}))}};
 s.setDrawing(drawing);await s.agent.annotate(session,{...s.input(),comments:Array.from({length:3},(_,i)=>({title:control.repeat(60),reason:control.repeat(1000),anchor:{type:'element',elementId:drawing.scene.elements[i]!.id}}))},'large',s.signal);
 const result:Record<string,unknown>=await s.read();expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(AGENT_LIMITS.summaryBytes);expect(Number(result.nextOffset)).toBeGreaterThan(0);expect(result.annotations).toMatchObject({itemsTruncated:true,count:3});
});
it('keeps pagination moving when a surviving annotation competes with the last element',async()=>{
 const s=await setup(),control='\u0001';
 const drawing=drawingSchema.parse({...s.drawing(),goal:control.repeat(2000),scene:{...s.drawing().scene,elements:Array.from({length:2},(_,i)=>({id:String(i).padEnd(256,control),type:'text',x:0,y:0,width:10,height:10,text:control.repeat(240)}))}});
 s.setDrawing(drawing);await s.agent.annotate(session,{...s.input(),comments:[{title:'annotation',reason:'a'.repeat(120),anchor:{type:'element',elementId:drawing.scene.elements[0]!.id}}]},'one-large-annotation',s.signal);
 const before=canonical(drawing),visited:string[]=[];let offset=0,first:unknown;
 for(let page=0;page<drawing.scene.elements.length;page++){
  const result:Record<string,unknown>=await s.agent.read(session,{revision:drawing.revision,offset},s.signal);
  if(page===0)first=result;
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(AGENT_LIMITS.summaryBytes);
  const elements=result.elements as {id:string}[];expect(elements.length).toBeGreaterThan(0);visited.push(...elements.map(e=>e.id));
  if(!result.truncated){expect(result.nextOffset).toBeNull();break;}
  expect(Number(result.nextOffset)).toBeGreaterThan(offset);offset=Number(result.nextOffset);
 }
 expect(visited).toEqual(drawing.scene.elements.map(e=>e.id));expect(first).toMatchObject({annotations:{itemsTruncated:true,count:1}});
 expect(await s.read()).toEqual(first);expect(canonical(s.drawing())).toBe(before);
});
it('keeps the existing draft codepoint limit for empty and supplementary Unicode purposes',async()=>{
 const s=await setup();
 for(const goal of ['', '😀'.repeat(2000)]){
  s.setDrawing({...s.drawing(),goal});await s.agent.annotate(session,s.input(),goal?'unicode':'empty',s.signal);
  const stored=s.agent.comments.get(owner)!;expect(agentBatchSchema.parse(JSON.parse(JSON.stringify(stored))).goal).toBe(goal);
 }
 expect(agentBatchSchema.safeParse({...s.agent.comments.get(owner),goal:'😀'.repeat(2001)}).success).toBe(false);
});
it('preserves solved state on an idempotent tool replay and refuses changed replay arguments',async()=>{
 const s=await setup(),input=s.input();await s.agent.annotate(session,input,'call-1',s.signal);const current=s.agent.comments.get(owner)!;
 await s.agent.comments.update(owner,{batchId:current.id,expectedRevision:current.commentRevision,mutationId:randomUUID(),commentId:current.comments[0]!.id,status:'resolved'},async()=>{});
 await s.agent.annotate(session,input,'call-1',s.signal);expect(s.agent.comments.get(owner)?.comments[0]?.status).toBe('resolved');expect(s.stats().writes).toBe(2);
 await expect(s.agent.annotate(session,{...input,summary:'changed'},'call-1',s.signal)).rejects.toMatchObject({code:'MUTATION_REUSED'});
});
it('rejects stale drawing/annotation revisions and concurrent replacement without resurrecting an old batch',async()=>{
 const s=await setup(),input=s.input();const results=await Promise.allSettled([s.agent.annotate(session,input,'one',s.signal),s.agent.annotate(session,input,'two',s.signal)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(s.stats().writes).toBe(1);
 const oldRevision=s.drawing().revision;s.setDrawing({...s.drawing(),revision:randomUUID()});
 await expect(s.agent.annotate(session,input,'three',s.signal)).rejects.toMatchObject({code:'REVISION_CONFLICT'});await expect(s.agent.read(session,{revision:oldRevision},s.signal)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});
it('restores comments in a new repository and isolates the exact session/workspace lifecycle',async()=>{
 const s=await setup();await s.agent.annotate(session,s.input(),'one',s.signal);const stored=s.rows.get(ownerKey(owner))!;
 expect(agentBatchSchema.parse(JSON.parse(JSON.stringify(stored))).id).toBe(stored.id);
 const repo=new CommentRepository<AgentBatch>({get:(key:string)=>s.rows.get(key)} as unknown as KvTable<string,AgentBatch>);
 expect(repo.get(owner)?.comments).toEqual(stored.comments);expect(repo.get({...owner,cwd:'/another'})).toBeNull();expect(repo.get({...owner,createdAt:'124'})).toBeNull();
 s.setOwner({...owner,createdAt:'124'});await expect(s.read()).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(s.stats().writes).toBe(1);
});
it('cancellation, absent drawing and invalid operation fields leave storage untouched',async()=>{
 const s=await setup(),abort=new AbortController();abort.abort();await expect(s.agent.annotate(session,s.input(),'one',abort.signal)).rejects.toThrow();
 expect(agentAnnotateSchema.safeParse({...s.input(),execute:'code'}).success).toBe(false);expect(agentReadSchema.safeParse({sessionId:'another'}).success).toBe(false);
 s.setDrawing(null);expect(await s.read()).toMatchObject({hasDrawing:false,revision:null});expect(s.stats().writes).toBe(0);
});
it('rejects a quoted null batch token without a write and accepts a corrected JSON null',async()=>{
 const s=await setup(),before=canonical(s.drawing());
 await expect(s.agent.annotate(session,{...s.input(),expectedBatchId:'null'},'bad-null',s.signal)).rejects.toThrow();
 expect(s.stats().writes).toBe(0);expect(canonical(s.drawing())).toBe(before);
 await expect(s.agent.annotate(session,s.input(),'correct-null',s.signal)).resolves.toMatchObject({count:1});
 expect(s.stats().writes).toBe(1);expect(canonical(s.drawing())).toBe(before);
});
it('uses the fixed DSH tool DSL and requires an owning Agent, never model-provided session identity',async()=>{
 const s=await setup(),tools=createSketchTools(s.agent,s.signal,p=>p);
 expect(tools.map(t=>t.name)).toEqual(['sketch_read','sketch_annotate']);
 const exec={signal:s.signal,callId:'fixture'} as Parameters<typeof tools[0]['execute']>[1];
 await expect(tools[0]!.execute({},exec)).rejects.toThrow('owning Agent');
 const result=await tools[0]!.execute({}, {...exec,agent:{session:{header:session}}} as typeof exec);
 expect(result).toMatchObject({revision:s.drawing().revision});expect(tools[0]!.output.render({},result as never)[0]).toMatchObject({type:'text'});
});
it('reads explicitly set native selection and its bound labels without changing the full-summary cache or drawing',async()=>{
 const s=await setup(),before=canonical(s.drawing());await s.read();
 expect(s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:['rect']},s.drawing())).toMatchObject({count:2,persisted:false});
 const result=await s.agent.read(session,{scope:'focus',mode:'elements',revision:s.drawing().revision},s.signal);
 expect(result).toMatchObject({scope:'focus',totalElements:2,sceneTotalElements:3,focus:{count:2,stale:false},elements:[{id:'rect'},{id:'text',text:'三角形内角和'}]});
 expect(result).toMatchObject({elements:[{editRestriction:'bound'},{editRestriction:'bound'}]});
 expect(JSON.stringify(result)).not.toContain('NO_LEAK');expect(JSON.stringify(result)).not.toContain('"id":"free"');
 expect(await s.read()).toMatchObject({scope:'focus',totalElements:2,focus:{count:2}});expect(canonical(s.drawing())).toBe(before);expect(s.stats().writes).toBe(0);
 s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:[]},s.drawing());
 expect(await s.read()).toMatchObject({scope:'all',totalElements:3});expect(s.agent.measurements.at(-1)?.cacheHit).toBe(true);
});
it('rejects stale, deleted, excessive and wrong-owner focus; clearing/restart cannot silently bind a different element',async()=>{
 const s=await setup(),revision=s.drawing().revision;
 for(const input of [{revision,elementIds:['deleted']},{revision,elementIds:['rect','rect']},{revision,elementIds:Array(51).fill('rect')},{revision:crypto.randomUUID(),elementIds:['rect']}])expect(()=>s.agent.setFocus(owner,input,s.drawing())).toThrow();
 expect(()=>s.agent.setFocus({...owner,cwd:'/else'},{revision,elementIds:['rect']},s.drawing())).toThrow();
 s.agent.setFocus(owner,{revision,elementIds:['free']},s.drawing());s.setDrawing({...s.drawing(),revision:crypto.randomUUID()});
 await expect(s.read()).rejects.toMatchObject({code:'FOCUS_STALE'});await expect(s.agent.read(session,{scope:'focus',revision:s.drawing().revision},s.signal)).rejects.toMatchObject({code:'FOCUS_STALE'});
 s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:[]},s.drawing());expect(await s.read()).toMatchObject({focus:null});
 s.agent.setFocus(owner,{revision:s.drawing().revision,elementIds:['rect']},s.drawing());s.agent.clear();expect(await s.read()).toMatchObject({focus:null});
 expect(agentReadSchema.safeParse({scope:'focus'}).success).toBe(false);expect(agentReadSchema.safeParse({scope:'focus',revision,mode:'elements',elementIds:['rect']}).success).toBe(false);
});
it('paginates focused data within exact byte limits without polluting the full-scene cache',async()=>{
 const s=await setup();const drawing={...s.drawing(),scene:{...s.drawing().scene,elements:Array.from({length:50},(_,i)=>({id:String(i).padEnd(256,'x'),type:'text' as const,x:0,y:0,width:10,height:10,text:'😀'.repeat(240)}))}};s.setDrawing(drawing);
 s.agent.setFocus(owner,{revision:drawing.revision,elementIds:drawing.scene.elements.map(e=>e.id)},drawing);const visited:string[]=[];let offset=0;
 for(let page=0;page<50;page++){const result=await s.agent.read(session,{scope:'focus',revision:drawing.revision,offset},s.signal) as Record<string,unknown>;expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(AGENT_LIMITS.summaryBytes);const elements=result.elements as {id:string}[];expect(elements.length).toBeGreaterThan(0);visited.push(...elements.map(e=>e.id));if(!result.truncated)break;expect(Number(result.nextOffset)).toBeGreaterThan(offset);offset=Number(result.nextOffset);}
 expect(visited).toEqual(drawing.scene.elements.map(e=>e.id));expect(s.stats().writes).toBe(0);
});
it('does not leak outside elements or annotation text through all/default/ID reads while focus is set',async()=>{
 const s=await setup(),revision=s.drawing().revision;
 await s.agent.annotate(session,{...s.input(),comments:[s.input().comments[0],{title:'OUTSIDE_COMMENT',reason:'OUTSIDE_REASON',anchor:{type:'element',elementId:'free'}}]},'before-focus',s.signal);
 s.agent.setFocus(owner,{revision,elementIds:['rect']},s.drawing());
 for(const input of [{},{scope:'all'},{scope:'all',mode:'elements',revision}]){
  const result=await s.agent.read(session,input,s.signal);
  expect(result).toMatchObject({scope:'focus',totalElements:2});
  expect(JSON.stringify(result)).not.toMatch(/OUTSIDE_|"id":"free"/);
 }
 await expect(s.agent.read(session,{scope:'all',mode:'elements',revision,elementIds:['free']},s.signal)).rejects.toMatchObject({code:'ELEMENT_NOT_FOUND'});
 await expect(s.agent.annotate(session,{...s.input(),comments:[{title:'outside',reason:'outside',anchor:{type:'element',elementId:'free'}}]},'outside-focus',s.signal)).rejects.toMatchObject({code:'FOCUS_SCOPE'});
 expect(s.stats().writes).toBe(1);
});
it('never substitutes a full image when an active focus image is missing or stale',async()=>{
 const read=vi.fn(async(..._args:Parameters<VisualRepository['read']>)=>{throw new SketchError('VISUAL_MISSING','focus image missing');});
 const s=await setup({read} as unknown as VisualRepository),revision=s.drawing().revision;
 s.agent.setFocus(owner,{revision,elementIds:['rect']},s.drawing());
 await expect(s.agent.readImage(session,{revision,scope:'all'},s.signal)).rejects.toMatchObject({code:'VISUAL_MISSING'});
 expect(read.mock.calls[0]?.[2]).toBe('focus');
 s.agent.setFocus(owner,{revision,elementIds:[]},s.drawing());
 await expect(s.agent.readImage(session,{revision,scope:'all'},s.signal)).rejects.toThrow();
 expect(read.mock.calls[1]?.[2]).toBe('all');
});
