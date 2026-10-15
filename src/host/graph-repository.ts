import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {canonical,ownerKey,sessionOwner,sameOwner,SketchError,type Owner} from '../core/contracts.ts';
import {graphSaveSchema,type SketchGraph} from '../core/graph.ts';
import {RecordBytes} from './record-bytes.ts';

/** Node creation is one graph write; an untouched document is an empty scene. */
export class GraphRepository {
 private tail:Promise<unknown>=Promise.resolve();
 private bytes=new RecordBytes<SketchGraph>();
 constructor(private table:KvTable<string,SketchGraph>){}
 get(owner:Owner){const base=sessionOwner(owner),value=this.table.get(ownerKey(base));return value&&sameOwner(value.owner,base)?value:null;}
 save(owner:Owner,input:unknown,check:()=>Promise<void>):Promise<SketchGraph>{
  const args=graphSaveSchema.parse(input),base=sessionOwner(owner);
  const run=this.tail.then(async()=>{
   await check();const current=this.get(base),key=ownerKey(base);
   if(current?.mutationId===args.mutationId){if(canonical(current.content)!==canonical(args.content))throw new SketchError('MUTATION_REUSED','重复工作流请求内容不一致');return current;}
   if((current?.revision??null)!==args.expectedRevision)throw new SketchError('REVISION_CONFLICT','另一窗口已修改工作流，请下载本地备份后重新载入',409);
   if(current&&canonical(current.content)===canonical(args.content))return current;
   const value:SketchGraph={formatVersion:1,owner:base,revision:randomUUID(),mutationId:args.mutationId,updatedAt:new Date().toISOString(),content:args.content};
   if((!current&&this.table.size>=500)||this.bytes.replacing(this.table,key,value)>16*1024*1024)throw new SketchError('STORAGE_FULL','工作流存储已满',413);
   await check();
   if(current)return this.table.update(key,stored=>{if(stored.revision!==args.expectedRevision)throw new SketchError('REVISION_CONFLICT','工作流已变化',409);return value;});
   await this.table.put(key,value);return value;
  });this.tail=run.catch(()=>{});return run;
 }
 async drain(){await this.tail;}
}
