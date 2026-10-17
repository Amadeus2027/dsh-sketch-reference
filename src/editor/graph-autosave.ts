import {canonical} from '../core/contracts.ts';
import {graphContentSchema,type GraphContent,type SketchGraph} from '../core/graph.ts';
import type {GraphPending} from './graph-recovery.ts';

export type GraphSavePhase='clean'|'dirty'|'saving'|'error';
/** One CAS request in flight; later interactions replace only the queued state. */
export class GraphAutosave {
 private graph:SketchGraph|null=null;
 private record:GraphPending|null=null;
 private flight:Promise<SketchGraph|null>|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private layoutTimer:ReturnType<typeof setTimeout>|undefined;
 private staged:GraphContent|null=null;
 private persisted:GraphPending|null=null;
 private failure:unknown;
 private phase:GraphSavePhase='clean';
 constructor(private io:{write:(record:GraphPending)=>void;clear:(mutationId:string)=>void;save:(request:GraphPending['request'])=>Promise<SketchGraph>;saved:(graph:SketchGraph)=>void;changed:(phase:GraphSavePhase,record:GraphPending|null,error?:unknown)=>void},private delay=300){}
 private changed(phase:GraphSavePhase){this.phase=phase;this.io.changed(phase,this.record,this.failure);}
 reset(graph:SketchGraph|null,record:GraphPending|null=null){
  if(this.flight)throw new Error('工作流正在保存');this.cancelTimer();this.cancelLayout();this.staged=null;this.graph=graph;this.record=record;this.persisted=record;this.failure=record?new Error('有未确认保存的工作流副本'):undefined;this.changed(record?'error':'clean');
 }
 /** Layout is immutable UI state; validate and persist at most twice a second,
  * plus gesture end/navigation. Structural edits still use update immediately. */
 stageLayout(content:GraphContent){
  if(this.phase==='error')throw this.failure;
  this.staged=content;this.cancelTimer();if(this.phase==='clean')this.changed('dirty');
  if(!this.layoutTimer)this.layoutTimer=setTimeout(()=>{try{this.checkpointLayout();}catch{/* changed reports and retains the failed record. */}},500);
 }
 checkpointLayout(){if(this.staged)this.update(this.staged);}
 private cancelLayout(){clearTimeout(this.layoutTimer);this.layoutTimer=undefined;}
 private persist(){if(this.record&&this.persisted!==this.record){this.io.write(this.record);this.persisted=this.record;}}
 update(content:GraphContent){
  if(this.phase==='error')throw this.failure;
  content=graphContentSchema.parse(content);
  this.staged=null;this.cancelLayout();
  if(!this.record&&canonical(content)===canonical(this.graph?.content)){if(this.phase!=='clean')this.changed('clean');return;}
  if(this.record){this.record=this.flight?{...this.record,next:content}:{...this.record,request:{...this.record.request,content}};}
  else this.record={request:{expectedRevision:this.graph?.revision??null,mutationId:crypto.randomUUID(),content},next:null};
  try{this.persist();}catch(error){this.failure=error;this.changed('error');throw error;}
  this.changed(this.flight?'saving':'dirty');this.cancelTimer();this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},this.delay);
 }
 private cancelTimer(){clearTimeout(this.timer);this.timer=undefined;}
 flush():Promise<SketchGraph|null>{
  try{this.checkpointLayout();}catch(error){return Promise.reject(error);}
  this.cancelTimer();if(this.flight)return this.flight;if(this.phase==='error')return Promise.reject(this.failure);
  if(!this.record)return Promise.resolve(this.graph);
  this.flight=this.drain().finally(()=>{this.flight=null;});return this.flight;
 }
 private async drain(){
  try{while(this.record){
   this.persist();this.changed('saving');const request=this.record.request,value=await this.io.save(request);this.graph=value;this.io.saved(value);
   this.checkpointLayout();
   const next=this.record.next;
   if(next&&canonical(next)!==canonical(value.content)){
    this.record={request:{expectedRevision:value.revision,mutationId:crypto.randomUUID(),content:next},next:null};this.persist();
   }else{this.io.clear(request.mutationId);this.record=null;}
  }this.failure=undefined;this.changed('clean');return this.graph;
  }catch(error){try{this.checkpointLayout();}catch{/* Keep the request/next record for retry. */}this.failure=error;this.changed('error');throw error;}
 }
 retry(){this.failure=undefined;this.changed('dirty');return this.flush();}
 dispose(){try{this.checkpointLayout();}catch{/* Recovery failure has already been reported. */}this.cancelTimer();this.cancelLayout();}
}
