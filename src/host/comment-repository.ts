import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {ownerKey,sameOwner,canonical,SketchError,type Owner,type Batch,type CommentUpdate} from '../core/contracts.ts';
import {withComments,type CommentRecord} from '../core/comments.ts';

/** Advice replacement and state writes serialize independently of drawing CAS. */
export class CommentRepository<T extends CommentRecord=Batch> {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private table:KvTable<string,T>){}
 get(owner:Owner):(T&{commentRevision:string;comments:NonNullable<T['comments']>})|null {
  const batch=this.table.get(ownerKey(owner));return batch&&sameOwner(batch.owner,owner)?withComments(batch):null;
 }
 private write<T>(operation:()=>Promise<T>):Promise<T>{const task=this.tail.then(operation);this.tail=task.catch(()=>{});return task;}
 put(batch:T,check:()=>Promise<void>,expectedId?:string|null){return this.write(async()=>{
  await check();const key=ownerKey(batch.owner);
  if(expectedId!==undefined&&(this.get(batch.owner)?.id??null)!==expectedId)throw new SketchError('BATCH_CHANGED','批注已变化，请重新读取后标注',409);
  if(!this.table.get(key)&&this.table.size>=500)throw new SketchError('STORAGE_FULL','建议存储已满，请先导出备份',413);
  const next=withComments(batch);await this.table.put(key,next);return next;
 });}
 update(owner:Owner,input:CommentUpdate,check:()=>Promise<void>){return this.write(async()=>{
  await check();const current=this.get(owner);
  if(!current||current.id!==input.batchId)throw new SketchError('BATCH_CHANGED','建议已被重新分析替换，请刷新批注',409);
  if(current.commentMutation?.mutationId===input.mutationId){
   if(canonical(current.commentMutation)!==canonical(input))throw new SketchError('MUTATION_REUSED','重复批注请求内容不一致');
   return current;
  }
  if(current.commentRevision!==input.expectedRevision)throw new SketchError('COMMENT_CONFLICT','另一窗口已修改批注，请刷新后重试',409);
  const target=current.comments.find(c=>c.id===input.commentId);
  if(!target)throw new SketchError('COMMENT_NOT_FOUND','批注不存在',404);
  const next={...current,commentRevision:randomUUID(),commentMutation:input,comments:current.comments.map(c=>c.id===input.commentId?{...c,status:input.status}:c)};
  await check();
  return this.table.update(ownerKey(owner),stored=>{
   const live=withComments(stored);
   if(live.id!==input.batchId||live.commentRevision!==input.expectedRevision)throw new SketchError('COMMENT_CONFLICT','批注已变化，请刷新后重试',409);
   return next;
  }).then(withComments);
 });}
 async drain(){await this.tail;}
}
