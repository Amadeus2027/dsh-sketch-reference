import { randomUUID } from 'node:crypto';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { digest,contentDigest,ownerKey,sameOwner,SketchError,type Owner,type Drawing,type Save } from '../core/contracts.ts';
/** All drawing writes share admission so initial creates and capacity checks are serialized. */
export class Repository {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private table:KvTable<string,Drawing>) {}
 get(owner:Owner):Drawing|null {const d=this.table.get(ownerKey(owner)); return d && sameOwner(owner,d.owner) ? d : null;}
 save(owner:Owner,input:Save,check:()=>Promise<void>):Promise<Drawing> {
  const run=this.tail.then(async()=>{
   await check();
   const key=ownerKey(owner), current=this.get(owner);
   const sceneDigest=await digest(input.scene), visible=await contentDigest(input.scene);
   if(current?.mutationId===input.mutationId) {
    if(current.sceneDigest!==sceneDigest || current.goal!==input.goal) throw new SketchError('MUTATION_REUSED','重复请求内容不一致');
    return current;
   }
   if((current?.revision??null)!==input.expectedRevision) throw new SketchError('REVISION_CONFLICT','另一窗口已修改草图，请保留备份后载入服务器版本',409);
   if(current?.sceneDigest===sceneDigest && current.goal===input.goal) return current;
   const record:Drawing={formatVersion:1,owner,revision:randomUUID(),mutationId:input.mutationId,sceneDigest,contentDigest:visible,scene:input.scene,goal:input.goal,updatedAt:new Date().toISOString()};
   const total=Array.from(this.table.entries()).reduce((sum,[k,d])=>sum+(k===key?0:Buffer.byteLength(JSON.stringify(d))),0)+Buffer.byteLength(JSON.stringify(record));
   if((!current && this.table.size>=500) || total>128*1024*1024) throw new SketchError('STORAGE_FULL','草图存储已满，请先导出备份',413);
   await check();
   if(current) return this.table.update(key,d=>{
    if(d.revision!==input.expectedRevision) throw new SketchError('REVISION_CONFLICT','另一窗口已修改草图',409);
    return record;
   });
   await this.table.put(key,record); return record;
  });
  this.tail=run.catch(()=>{}); return run;
 }
 async drain() {await this.tail;}
}
