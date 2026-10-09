import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {digest,ownerKey,sameOwner,SketchError,type Owner,type Drawing} from '../core/contracts.ts';
import {EDIT_LIMITS,proposeEditSchema,proposalReadSchema,validateOperations,validateEditScene,type EditProposal} from '../core/edits.ts';
import type {Repository} from './repository.ts';

/** One bounded proposal per owner. Proposal writes never modify drawings. */
export class EditRepository {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private table:KvTable<string,EditProposal>,private drawings:Repository){}
 get(owner:Owner){
  const value=this.table.get(ownerKey(owner));if(!value||!sameOwner(owner,value.owner))return null;
  const current=this.drawings.get(owner);
  // Reconcile a committed drawing even if recording its receipt failed.
  return value.status==='pending'&&current?.mutationId===value.id?{...value,status:'applied' as const,resultRevision:current.revision,applicationDigest:current.sceneDigest}:value;
 }
 private write<T>(run:()=>Promise<T>):Promise<T>{const task=this.tail.then(run);this.tail=task.catch(()=>{});return task;}
 read(owner:Owner,input:unknown){
  const known=input===null?null:proposalReadSchema.parse(input),proposal=this.get(owner);
  const unchanged=!!proposal&&known?.knownId===proposal.id&&known.knownStatus===proposal.status;
  return {available:true,unchanged,proposal:unchanged?null:proposal};
 }
 propose(owner:Owner,input:unknown,callId:string,check:()=>Promise<void>){return this.write(async()=>{
  const args=proposeEditSchema.parse(input);await check();
  const callKey=await digest([ownerKey(owner),callId]),inputDigest=await digest(args),previous=this.get(owner);
  if(previous?.toolCallKey===callKey){if(previous.toolInputDigest!==inputDigest)throw new SketchError('MUTATION_REUSED','重复提议内容不一致');return previous;}
  const drawing=this.drawings.get(owner);
  if(!drawing||drawing.revision!==args.revision)throw new SketchError('REVISION_CONFLICT','草图已变化，请重新读取后提议',409);
  if((previous?.id??null)!==args.expectedProposalId)throw new SketchError('PROPOSAL_CHANGED','修改提议已变化，请重新读取',409);
  validateOperations(drawing.scene,args.operations);
  const value:EditProposal={id:randomUUID(),owner,baseRevision:drawing.revision,before:structuredClone(drawing.scene),goal:drawing.goal,summary:args.summary,operations:args.operations,createdAt:new Date().toISOString(),status:'pending',toolCallKey:callKey,toolInputDigest:inputDigest};
  const key=ownerKey(owner),bytes=Array.from(this.table.entries()).reduce((sum,[k,v])=>sum+(k===key?0:Buffer.byteLength(JSON.stringify(v))),0)+Buffer.byteLength(JSON.stringify(value));
  if((!previous&&this.table.size>=EDIT_LIMITS.records)||bytes>EDIT_LIMITS.storageBytes)throw new SketchError('STORAGE_FULL','修改提议存储已满，请先下载备份',413);
  await check();if(this.drawings.get(owner)?.revision!==value.baseRevision)throw new SketchError('REVISION_CONFLICT','草图已变化',409);
  await this.table.put(key,value);return value;
 });}
 dismiss(owner:Owner,id:string,check:()=>Promise<void>){return this.write(async()=>{
  await check();const value=this.require(owner,id);
  if(value.status==='applied'||this.drawings.get(owner)?.mutationId===value.id)throw new SketchError('PROPOSAL_APPLIED','提议已应用，不能忽略；可用原生撤销或修改前备份恢复',409);
  const next={...value,status:'dismissed' as const};await this.table.put(ownerKey(owner),next);return next;
 });}
 apply(owner:Owner,id:string,scene:Drawing['scene'],check:()=>Promise<void>){return this.write(async()=>{
  await check();const value=this.require(owner,id);validateEditScene(value,scene);
  const current=this.drawings.get(owner),applicationDigest=await digest(scene);
  if(current&&(current.mutationId===value.id||(value.status==='applied'&&current.revision===value.resultRevision&&current.sceneDigest===value.applicationDigest))){
   if(current.sceneDigest!==applicationDigest||current.goal!==value.goal)throw new SketchError('MUTATION_REUSED','重复应用内容不一致');
   const next={...value,status:'applied' as const,resultRevision:current.revision,applicationDigest};await this.table.put(ownerKey(owner),next);return current;
  }
  if(value.status!=='pending')throw new SketchError('PROPOSAL_CHANGED','提议已处理，请刷新',409);
  if(!current||current.revision!==value.baseRevision)throw new SketchError('REVISION_CONFLICT','草图已变化，请重新提议，未覆盖任何内容',409);
  // The same CAS and idempotent drawing write used by manual autosave.
  const saved=await this.drawings.save(owner,{expectedRevision:value.baseRevision,mutationId:value.id,scene,goal:value.goal},check);
  // If this metadata write fails, a retry reconciles via the drawing mutation ID.
  await this.table.put(ownerKey(owner),{...value,status:'applied',resultRevision:saved.revision,applicationDigest});return saved;
 });}
 private require(owner:Owner,id:string){const value=this.get(owner);if(!value||value.id!==id)throw new SketchError('PROPOSAL_CHANGED','修改提议已替换，请刷新',409);return value;}
 async drain(){await this.tail;}
}
