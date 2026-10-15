import {z} from 'zod';
import {ownerKey,saveSchema,type Owner} from '../core/contracts.ts';
import {graphContentSchema,graphSaveSchema} from '../core/graph.ts';
import {pendingTabId} from './pending.ts';

export const graphPendingSchema=z.object({request:graphSaveSchema,next:graphContentSchema.nullable()}).strict();
export type GraphPending=z.infer<typeof graphPendingSchema>;
export const graphImportSchema=z.object({graph:graphSaveSchema,documents:z.array(z.object({nodeId:z.uuid(),input:saveSchema}).strict()).max(100)}).strict();
export type ImportJob=z.infer<typeof graphImportSchema>;

/** Tab identity survives refresh. Other tabs' records are never selected or cleared. */
export class GraphRecovery {
 readonly pendingKey:string;
 readonly importKey:string;
 private legacy:string;
 constructor(owner:Owner,tab=pendingTabId()){
  this.legacy='dsh-sketch-graph:v1:'+encodeURIComponent(ownerKey(owner));
  this.pendingKey=this.legacy+':tab:'+tab;this.importKey=this.pendingKey+':import';
 }
 readPending():GraphPending|null{
  const raw=localStorage.getItem(this.pendingKey);if(raw)return graphPendingSchema.parse(JSON.parse(raw));
  const old=localStorage.getItem(this.legacy);if(!old)return null;
  // Preserve old shared records until this tab has its own durable copy.
  const record={request:graphSaveSchema.parse(JSON.parse(old)),next:null};this.writePending(record);return record;
 }
 writePending(record:GraphPending){localStorage.setItem(this.pendingKey,JSON.stringify(record));}
 clearPending(mutationId:string){
  for(const key of [this.pendingKey,this.legacy]){
   const raw=localStorage.getItem(key);if(!raw)continue;
   try{const value=JSON.parse(raw);if((key===this.legacy?value.mutationId:value.request?.mutationId)===mutationId)localStorage.removeItem(key);}catch{/* Leave damaged recovery data intact. */}
  }
 }
 private open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open('dsh-sketch-graph-recovery',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('imports');
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('恢复数据库被其他页面阻塞，请关闭旧页面后重试'));
  request.onsuccess=()=>resolve(request.result);
 });}
 private async importRecord(work:(store:IDBObjectStore)=>IDBRequest,write=false):Promise<unknown>{
  const db=await this.open();try{return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('imports',write?'readwrite':'readonly'),request=work(transaction.objectStore('imports'));let result:unknown;
   request.onsuccess=()=>{result=request.result;};transaction.oncomplete=()=>resolve(result);transaction.onabort=()=>reject(transaction.error??request.error??new Error('恢复任务未保存'));transaction.onerror=()=>{};
  });}finally{db.close();}
 }
 async readImport():Promise<ImportJob|null>{
  const stored=await this.importRecord(store=>store.get(this.importKey));if(stored)return graphImportSchema.parse(stored);
  const raw=localStorage.getItem(this.legacy+':import');if(!raw)return null;
  const task=graphImportSchema.parse(JSON.parse(raw));await this.writeImport(task);return task;
 }
 async writeImport(task:ImportJob){
  // Transaction completion, including quota admission, precedes every server write.
  try{await this.importRecord(store=>store.put(task,this.importKey),true);}catch{throw new Error('无法持久保存备份恢复任务（数据库不可用或空间不足）；尚未开始恢复，请释放空间后重试');}
 }
 async clearImport(mutationId:string){
  const db=await this.open();try{await new Promise<void>((resolve,reject)=>{
   const transaction=db.transaction('imports','readwrite'),store=transaction.objectStore('imports'),request=store.get(this.importKey);
   request.onsuccess=()=>{if(request.result?.graph?.mutationId===mutationId)store.delete(this.importKey);};transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error);transaction.onerror=()=>{};
  });}finally{db.close();}
  const key=this.legacy+':import',raw=localStorage.getItem(key);if(raw)try{if(JSON.parse(raw).graph?.mutationId===mutationId)localStorage.removeItem(key);}catch{/* Preserve damaged legacy records. */}
 }
}
