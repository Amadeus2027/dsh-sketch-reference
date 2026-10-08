import {ANALYSIS_LIMITS} from './limits.ts';
import type {Batch,Drawing,Anchor} from './contracts.ts';

export type CommentBatch=Batch&{commentRevision:string;comments:NonNullable<Batch['comments']>};
/** Pure legacy view: stable IDs and CAS token, without rewriting the stored batch on reads. */
export function withComments(batch:Batch):CommentBatch {
 return {...batch,commentRevision:batch.commentRevision??batch.id,comments:batch.comments??batch.advice.suggestions.map((_,i)=>({id:batch.id.slice(0,-1)+i.toString(16),suggestionIndex:i,status:'open' as const,createdAt:batch.createdAt}))};
}
export function adviceIsStale(batch:Batch|null,contentDigest:string|null|undefined,goal:string):boolean {
 return !!batch && (batch.contentDigest!==contentDigest || batch.goal!==goal);
}
export function anchorTarget<T extends {id:string;isDeleted?:boolean|undefined}>(anchor:Anchor|undefined,elements:readonly T[]):T|null {
 return anchor?elements.find(e=>e.id===anchor.elementId&&!e.isDeleted)??null:null;
}
/** Only compact, bounded visual fields leave the scene store. IDs outside this list cannot be anchored. */
export function describeScene(scene:Drawing['scene']) {
 const active=scene.elements.filter(e=>!e.isDeleted);
 const elements:Array<{id:string;type:string;x:number;y:number;width:number;height:number;angle:number;text?:string}>=[];
 const encoder=new TextEncoder();let bytes=2;
 for(const e of active){
  if(elements.length>=ANALYSIS_LIMITS.maxElements)break;
  const item={id:e.id,type:e.type,x:e.x,y:e.y,width:e.width,height:e.height,angle:e.angle??0,...(e.type==='text'?{text:Array.from(e.text??'').slice(0,ANALYSIS_LIMITS.maxElementTextChars).join('')}:{})};
  const size=encoder.encode(JSON.stringify(item)).length+(elements.length?1:0);
  if(bytes+size>ANALYSIS_LIMITS.maxStructureBytes)break;
  elements.push(item);bytes+=size;
 }
 return {elements,totalElements:active.length,truncated:elements.length<active.length};
}
