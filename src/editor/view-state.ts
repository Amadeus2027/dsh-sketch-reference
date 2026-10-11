import {z} from 'zod';
import {ownerKey,type Owner} from '../core/contracts.ts';

// Local viewport preference only: excluded from scene hashes, undo and Agent data.
const viewSchema=z.object({zoom:z.object({value:z.number().min(.1).max(30)}).strip(),scrollX:z.number().finite(),scrollY:z.number().finite()}).strip();
export type ViewState=z.infer<typeof viewSchema>;
const key=(owner:Owner)=>'dsh-sketch-view:v1:'+encodeURIComponent(ownerKey(owner));
export function captureView(state:unknown):ViewState|null {
 const parsed=viewSchema.safeParse(state);return parsed.success?parsed.data:null;
}
export function readView(owner:Owner):ViewState|null {
 try{return captureView(JSON.parse(localStorage.getItem(key(owner))??'null'));}catch{return null;}
}
export function writeView(owner:Owner,state:ViewState|null):void {
 // A blocked/full browser store must never prevent closing or saving the sketch.
 if(!state)return;
 try{localStorage.setItem(key(owner),JSON.stringify(state));}catch{/* Best-effort view preference. */}
}
