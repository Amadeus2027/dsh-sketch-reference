import type {Drawing} from '../core/contracts.ts';

export interface GraphThumbnail {drawing:Drawing|null;url:string;bounds:number[]|null}
/** Owned by one workspace, not a global cache. Revisions include empty drawings. */
export class GraphThumbnails {
 private entries=new Map<string,{revision:string|null|undefined;abort:AbortController;value:Promise<GraphThumbnail>;url:string}>();
 constructor(private load:(id:string,signal:AbortSignal)=>Promise<Drawing|null>,private render:(drawing:Drawing)=>Promise<{url:string;bounds:number[]}>,private revoke=(url:string)=>URL.revokeObjectURL(url)){}
 retain(revisions:Map<string,string|null|undefined>){for(const [id,entry] of this.entries)if(!revisions.has(id)||revisions.get(id)!==entry.revision)this.remove(id);}
 get(id:string,revision:string|null|undefined):Promise<GraphThumbnail>{
  const cached=this.entries.get(id);if(revision!==undefined&&cached?.revision===revision)return cached.value;
  this.remove(id);
  if(this.entries.size>=100)this.remove(this.entries.keys().next().value!);
  const entry={revision,abort:new AbortController(),url:'',value:Promise.resolve(null as unknown as GraphThumbnail)};
  this.entries.set(id,entry);
  entry.value=(async()=>{
   const drawing=await this.load(id,entry.abort.signal);entry.abort.signal.throwIfAborted();
   if(revision!==undefined&&(drawing?.revision??null)!==revision)throw new Error('草图已变化，请重新进入总览刷新预览');
   const image=drawing?.scene.elements.some(e=>!e.isDeleted)?await this.render(drawing):{url:'',bounds:null};
   if(entry.abort.signal.aborted){if(image.url)this.revoke(image.url);entry.abort.signal.throwIfAborted();}
   entry.url=image.url;return {drawing,...image};
  })().catch(error=>{if(this.entries.get(id)===entry)this.remove(id);throw error;});
  return entry.value;
 }
 private remove(id:string){const entry=this.entries.get(id);if(!entry)return;this.entries.delete(id);entry.abort.abort();if(entry.url)this.revoke(entry.url);}
 dispose(){for(const id of this.entries.keys())this.remove(id);}
}
