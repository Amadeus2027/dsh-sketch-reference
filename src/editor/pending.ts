import {z} from 'zod';
import {ownerKey,sceneSchema,type Owner} from '../core/contracts.ts';
import type {Draft} from './autosave.ts';
const pendingSchema=z.object({scene:sceneSchema,goal:z.string().max(4000),base:z.string().nullable(),updated:z.number()}).strict();
function prefix(owner:Owner){return 'dsh-sketch:v1:'+encodeURIComponent(ownerKey(owner))+':';}
let windowId:string;
function id(){if(windowId)return windowId;try{windowId=sessionStorage.getItem('dsh-sketch:tab')??crypto.randomUUID();sessionStorage.setItem('dsh-sketch:tab',windowId);}catch{windowId=crypto.randomUUID();}return windowId;}
export function writePending(owner:Owner,draft:Draft,base:string|null){localStorage.setItem(prefix(owner)+id(),JSON.stringify({...draft,base,updated:Date.now()}));}
export function clearPending(owner:Owner){localStorage.removeItem(prefix(owner)+id());}
export function recoverPending(owner:Owner){
 const found:Array<{key:string;draft:z.infer<typeof pendingSchema>}>=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix(owner)))continue;
  try{const data=pendingSchema.safeParse(JSON.parse(localStorage.getItem(key)??'null'));if(data.success)found.push({key,draft:data.data});}catch{/* A damaged backup is left in storage for manual recovery. */}
 }
 return found.sort((a,b)=>b.draft.updated-a.draft.updated)[0]??null;
}
