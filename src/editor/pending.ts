import {z} from 'zod';
import {canonical,ownerKey,saveSchema,type Owner} from '../core/contracts.ts';
import type {Draft} from './autosave.ts';
const pendingSchema=z.object({scene:saveSchema.shape.scene,goal:saveSchema.shape.goal,base:saveSchema.shape.expectedRevision,updated:z.number().int().nonnegative()}).strict();
type Pending={key:string;draft:z.infer<typeof pendingSchema>};
type Recovery={available:boolean;pending:Pending|null};
function prefix(owner:Owner){return 'dsh-sketch:v1:'+encodeURIComponent(ownerKey(owner))+':';}
let windowId:string;
function id(){if(windowId)return windowId;try{windowId=sessionStorage.getItem('dsh-sketch:tab')??crypto.randomUUID();sessionStorage.setItem('dsh-sketch:tab',windowId);}catch{windowId=crypto.randomUUID();}return windowId;}
export function writePending(owner:Owner,draft:Draft,base:string|null){localStorage.setItem(prefix(owner)+id(),JSON.stringify({...draft,base,updated:Date.now()}));}
export function clearPending(owner:Owner){localStorage.removeItem(prefix(owner)+id());}
/** Call only after server confirmation. Never consume another tab's newer snapshot. */
export function consumePending(owner:Owner,pending:Pending){
 if(!pending.key.startsWith(prefix(owner)))return;
 const raw=localStorage.getItem(pending.key);if(raw===null)return;
 let current:unknown;try{current=JSON.parse(raw);}catch{return;}
 const parsed=pendingSchema.safeParse(current);
 if(parsed.success&&canonical(parsed.data)===canonical(pending.draft))localStorage.removeItem(pending.key);
}
export function recoverPending(owner:Owner):Recovery{
 const found:Pending[]=[];
 try{
  const storage=localStorage,scope=prefix(owner);
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);if(!key?.startsWith(scope))continue;
   const raw=storage.getItem(key);
   try{const data=pendingSchema.safeParse(JSON.parse(raw??'null'));if(data.success)found.push({key,draft:data.data});}catch{/* A damaged backup is left in storage for manual recovery. */}
  }
 }catch{
  // An incomplete scan cannot safely select the newest backup. Leave storage untouched.
  return {available:false,pending:null};
 }
 return {available:true,pending:found.sort((a,b)=>b.draft.updated-a.draft.updated)[0]??null};
}
