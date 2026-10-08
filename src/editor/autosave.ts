import {canonical,type Drawing,type Save,type Owner} from '../core/contracts.ts';
export type SaveState='clean'|'dirty'|'saving'|'error'|'conflict';
export interface Draft {scene:Drawing['scene'];goal:string}
/** A single-flight queue retains failed mutation IDs for retry and never overwrites a conflict. */
export class Autosave {
 state:SaveState='clean'; error=''; revision:string|null;
 private persisted:string;private latest:Draft;private flight:Promise<Drawing>|null=null;
 private retry:Save|null=null;private timer:ReturnType<typeof setTimeout>|undefined;
 private disposed=false;
 constructor(readonly owner:Owner,initial:Drawing|null,private save:(input:Save)=>Promise<Drawing>,private changed:()=>void,private backup:(draft:Draft,revision:string|null)=>void) {
  this.revision=initial?.revision??null;
  this.latest={scene:initial?.scene??{elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}},goal:initial?.goal??''};
  this.persisted=canonical(this.latest);
 }
 current():Draft{return this.latest;}
 update(draft:Draft) {
  if(this.disposed)return;
  if(canonical(this.latest)===canonical(draft))return;
  this.latest=draft;this.backup(draft,this.revision);
  if(this.state!=='conflict'){this.state='dirty';clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},800);}
  this.changed();
 }
 async flush():Promise<Drawing|null> {
  clearTimeout(this.timer);
  if(this.disposed)throw new Error('画板已关闭');
  if(this.state==='conflict')throw new Error(this.error);
  if(this.flight){await this.flight;return this.flush();}
  if(!this.retry && this.persisted===canonical(this.latest)){this.state='clean';this.changed();return null;}
  const input=this.retry??{expectedRevision:this.revision,mutationId:crypto.randomUUID(),...structuredClone(this.latest)};
  this.retry=input;this.state='saving';this.error='';this.changed();
  const flight=this.save(input);this.flight=flight;
  try {
   const record=await flight;this.revision=record.revision;this.persisted=canonical({scene:record.scene,goal:record.goal});this.retry=null;
   if(this.persisted===canonical(this.latest)){this.state='clean';}else{this.state='dirty';this.backup(this.latest,this.revision);}
   this.changed();
   return record;
  }catch(error){
   this.state=(error as {code?:string}).code==='REVISION_CONFLICT'?'conflict':'error';
   this.error=error instanceof Error?error.message:'保存失败';this.changed();throw error;
  }finally{this.flight=null;if(!this.disposed && this.state==='dirty'){this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},0);}}
 }
 async settle():Promise<Drawing|null> {
  let record:Drawing|null=null;
  do {const result=await this.flush();if(result)record=result;}while(this.state==='dirty'||this.flight);
  return record;
 }
 dispose(){this.disposed=true;clearTimeout(this.timer);}
}
