import {it,expect} from 'vitest';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {randomUUID} from 'node:crypto';
import {Repository} from '../src/host/repository.ts';
import {EditRepository} from '../src/host/edit-repository.ts';
import {proposeEditSchema,proposalSchema,validateOperations,validateEditScene,createdElementId,type EditProposal,type EditOperation} from '../src/core/edits.ts';
import {canonical,type Drawing,type Owner} from '../src/core/contracts.ts';
import {Autosave} from '../src/editor/autosave.ts';
import {requestBodyLimit,SCENE_LIMITS,RPC_LIMITS} from '../src/core/limits.ts';
import type {JsonValue} from '../src/core/scene.ts';
import {SketchAgent} from '../src/host/agent.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import {createSketchTools} from '../src/host/tools.ts';
import type {AgentBatch} from '../src/core/agent.ts';
import type {SessionHeader} from '@deepseek-ai/dsh-session';

const owner:Owner={sessionId:'edits',createdAt:'1',cwd:'/test'};
it('admits a bounded editable scene for confirmation without widening small read/update requests',()=>{expect(requestBodyLimit('proposal/apply')).toBe(SCENE_LIMITS.maxSceneBytes+RPC_LIMITS.envelopeBytes);expect(requestBodyLimit('proposal/dismiss')).toBe(RPC_LIMITS.envelopeBytes);});
function memory<T>(){const rows=new Map<string,T>();return {rows,table:{get:(k:string)=>rows.get(k),put:async(k:string,v:T)=>{rows.set(k,structuredClone(v));},update:async(k:string,f:(v:T)=>T)=>{const v=f(rows.get(k)!);rows.set(k,structuredClone(v));return v;},entries:()=>rows.entries(),get size(){return rows.size;}} as unknown as KvTable<string,T>};}
async function setup(){
 const drawings=new Repository(memory<Drawing>().table),store=memory<EditProposal>(),edits=new EditRepository(store.table,drawings),check=async()=>{};
 const drawing=await drawings.save(owner,{expectedRevision:null,mutationId:randomUUID(),goal:'任意草图',scene:{elements:[{id:'r',type:'rectangle',x:10,y:20,width:80,height:60},{id:'other',type:'ellipse',x:200,y:20,width:30,height:30}],appState:{viewBackgroundColor:'#ffffff'},files:{}}},check);
 const input=(operations:EditOperation[]=[{op:'move',elementId:'r',x:60,y:80}])=>({revision:drawing.revision,expectedProposalId:edits.get(owner)?.id??null,summary:'移动形状',operations});
 const proposal=()=>edits.propose(owner,input(),'call',check);
 return {drawings,store,edits,drawing,input,proposal,check};
}
it('proposals persist without changing drawings and enforce session/revision/CAS/idempotency',async()=>{
 const s=await setup(),before=canonical(s.drawing),input=s.input();const p=await s.proposal();expect(proposalSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);expect(canonical(s.drawings.get(owner))).toBe(before);
 expect((await s.edits.propose(owner,input,'call',s.check)).id).toBe(p.id);
 await expect(s.edits.propose(owner,{...input,summary:'different'},'call',s.check)).rejects.toMatchObject({code:'MUTATION_REUSED'});
 await expect(s.edits.propose(owner,input,'second',s.check)).rejects.toMatchObject({code:'PROPOSAL_CHANGED'});
 await expect(s.edits.propose(owner,{...s.input(),revision:randomUUID()},'stale',s.check)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 expect(new EditRepository(s.store.table,s.drawings).get(owner)?.id).toBe(p.id);expect(s.edits.get({...owner,cwd:'/else'})).toBeNull();expect(s.edits.get({...owner,createdAt:'2'})).toBeNull();
});
it('exposes only a proposal tool, binds its owner to the official Agent execution context, and supplies no apply tool',async()=>{
 const s=await setup(),agent=new SketchAgent({snapshot:async(_session,signal)=>{signal.throwIfAborted();return {owner,drawing:s.drawings.get(owner)};},check:async(_owner,_revision,signal)=>signal.throwIfAborted(),changed:()=>{}},new CommentRepository(memory<AgentBatch>().table),s.edits);
 const tools=createSketchTools(agent,new AbortController().signal,p=>p);expect(tools.map(t=>t.name)).toEqual(['sketch_read','sketch_annotate','sketch_propose_edit']);
 const exec={signal:new AbortController().signal,callId:'native'} as Parameters<typeof tools[0]['execute']>[1];
 await expect(tools[2]!.execute(s.input(),exec)).rejects.toThrow('owning Agent');
 await expect(tools[2]!.execute(s.input(),{...exec,agent:{session:{header:{id:owner.sessionId,createdAt:1,cwd:owner.cwd} as unknown as SessionHeader}}} as typeof exec)).resolves.toMatchObject({status:'pending'});
 expect(s.drawings.get(owner)?.revision).toBe(s.drawing.revision);expect(agent.measurements.at(-1)).toMatchObject({tool:'sketch_propose_edit',inputTokens:null});
});
it('validates actual deltas and refuses unrelated content, forged creates and arbitrary fields',async()=>{
 const s=await setup(),p=await s.proposal(),scene=structuredClone(p.before);Object.assign(scene.elements[0]!,{x:60,y:80});expect(()=>validateEditScene(p,scene)).not.toThrow();
 const forged=structuredClone(scene);forged.elements[1]!.width=900;expect(()=>validateEditScene(p,forged)).toThrow('未提议');
 const style=structuredClone(scene);style.elements[0]!.strokeColor='#fff';expect(()=>validateEditScene(p,style)).toThrow('未提议');
 expect(proposeEditSchema.safeParse({...s.input(),scene}).success).toBe(false);expect(proposeEditSchema.safeParse({...s.input(),operations:[{op:'move',elementId:'r',x:1,y:2,execute:'code'}]}).success).toBe(false);
 const c=await s.edits.propose(owner,s.input([{op:'create',type:'rectangle',x:0,y:0,width:40,height:30}]),'create',s.check);
 const created={...c.before,elements:[...c.before.elements,{id:createdElementId(c.id,0),type:'rectangle' as const,x:0,y:0,width:40,height:30}]};expect(()=>validateEditScene(c,created)).not.toThrow();
 created.elements.at(-1)!.customData={code:'never'};expect(()=>validateEditScene(c,created)).toThrow();
});
it('applies through drawing CAS and safely retries a lost acknowledgement without a second drawing write',async()=>{
 const s=await setup(),p=await s.proposal(),scene=structuredClone(p.before);Object.assign(scene.elements[0]!,{x:60,y:80});
 const saved=await s.edits.apply(owner,p.id,scene,s.check);expect(saved.mutationId).toBe(p.id);expect(saved.revision).not.toBe(p.baseRevision);expect(s.edits.get(owner)?.status).toBe('applied');
 expect((await s.edits.apply(owner,p.id,scene,s.check)).revision).toBe(saved.revision);
 await s.drawings.save(owner,{expectedRevision:saved.revision,mutationId:randomUUID(),scene:p.before,goal:p.goal},s.check);
 await expect(s.edits.apply(owner,p.id,scene,s.check)).rejects.toMatchObject({code:'PROPOSAL_CHANGED'});expect(s.drawings.get(owner)?.scene).toEqual(p.before);
});
it('recovers a drawing commit when subsequent proposal metadata persistence fails',async()=>{
 const s=await setup(),p=await s.proposal(),scene=structuredClone(p.before);Object.assign(scene.elements[0]!,{x:60,y:80});
 const put=s.store.table.put.bind(s.store.table);let fail=true;s.store.table.put=async(...args)=>{if(fail){fail=false;throw new Error('metadata failed');}return put(...args);};
 await expect(s.edits.apply(owner,p.id,scene,s.check)).rejects.toThrow('metadata failed');expect(s.drawings.get(owner)?.mutationId).toBe(p.id);
 const committed=s.drawings.get(owner)!.revision;expect((await s.edits.apply(owner,p.id,scene,s.check)).revision).toBe(committed);expect(s.edits.get(owner)?.status).toBe('applied');
});
it('refuses stale, dismissed, replaced and cancelled proposals without changing the latest drawing',async()=>{
 const s=await setup(),p=await s.proposal();await s.edits.dismiss(owner,p.id,s.check);
 await expect(s.edits.apply(owner,p.id,p.before,s.check)).rejects.toThrow();
 const p2=await s.edits.propose(owner,s.input(),'new',s.check);await expect(s.edits.dismiss(owner,p.id,s.check)).rejects.toMatchObject({code:'PROPOSAL_CHANGED'});
 const changed=await s.drawings.save(owner,{expectedRevision:s.drawing.revision,mutationId:randomUUID(),scene:s.drawing.scene,goal:'changed'},s.check);
 const scene=structuredClone(p2.before);Object.assign(scene.elements[0]!,{x:60,y:80});await expect(s.edits.apply(owner,p2.id,scene,s.check)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(s.drawings.get(owner)).toEqual(changed);
 const abort=new AbortController();abort.abort();await expect(s.edits.propose(owner,s.input(),'abort',async()=>abort.signal.throwIfAborted())).rejects.toThrow();
});
it('rejects locked/bound/grouped targets, unsupported resizing and duplicate deletion',async()=>{
 const s=await setup(),move:EditOperation={op:'move',elementId:'r',x:0,y:0};
 for(const extra of [{locked:true},{groupIds:['g']},{boundElements:[{id:'label',type:'text'}]}] as Record<string,JsonValue>[])expect(()=>validateOperations({...s.drawing.scene,elements:[{...s.drawing.scene.elements[0]!,...extra}]},[move])).toThrow('首版');
 expect(()=>validateOperations({...s.drawing.scene,elements:[{id:'text',type:'text',text:'a',x:0,y:0,width:50,height:20}]},[{op:'resize',elementId:'text',width:40,height:30}])).toThrow('首版');
 expect(()=>validateOperations(s.drawing.scene,[{op:'delete',elementId:'r'},{op:'delete',elementId:'r'}])).toThrow();
 expect(proposeEditSchema.safeParse(s.input([{op:'create',type:'text',x:0,y:0,width:1,height:1}])).success).toBe(false);
 expect(proposeEditSchema.safeParse(s.input(Array(21).fill(move))).success).toBe(false);
});
it('only adopts externally acknowledged saves into a settled queue, then supports normal undo persistence',async()=>{
 const s=await setup(),queue=new Autosave(owner,s.drawing,input=>s.drawings.save(owner,input,s.check),()=>{},()=>{}),p=await s.proposal(),scene=structuredClone(p.before);Object.assign(scene.elements[0]!,{x:60,y:80});
 const saved=await s.edits.apply(owner,p.id,scene,s.check);queue.acceptExternal(saved,p.baseRevision);expect(queue.revision).toBe(saved.revision);expect(queue.state).toBe('clean');
 queue.update({scene:p.before,goal:p.goal});expect(()=>queue.acceptExternal(saved,saved.revision)).toThrow();await queue.settle();expect(s.drawings.get(owner)?.scene).toEqual(p.before);queue.dispose();
});
