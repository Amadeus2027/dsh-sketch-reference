import type {Drawing} from '../core/contracts.ts';

export interface GraphThumbnail {drawing:Drawing|null;url:string;bounds:number[]|null}
/** Owned by one workspace, not a global cache. Revisions include empty drawings. */
export class GraphThumbnails {
 private entries=new Map<string,{revision:string|null|undefined;abort:AbortController;value:Promise<GraphThumbnail>;url:string}>();
 private active=0;
 private waiting:Array<()=>void>=[];
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
   if(!drawing?.scene.elements.some(e=>!e.isDeleted))return {drawing,url:'',bounds:null};
   const release=await this.acquire(entry.abort.signal);
   try{
    entry.abort.signal.throwIfAborted();
    const image=await this.render(drawing);
    if(entry.abort.signal.aborted){if(image.url)this.revoke(image.url);entry.abort.signal.throwIfAborted();}
    entry.url=image.url;return {drawing,...image};
   }finally{release();}
  })().catch(error=>{if(this.entries.get(id)===entry)this.remove(id);throw error;});
  return entry.value;
 }
 /** Bound expensive canvas work without delaying empty-document reads. */
 private acquire(signal:AbortSignal):Promise<()=>void>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
   const cancel=()=>{const index=this.waiting.indexOf(start);if(index!==-1)this.waiting.splice(index,1);reject(signal.reason);};
   const start=()=>{signal.removeEventListener('abort',cancel);this.active++;let released=false;resolve(()=>{if(released)return;released=true;this.active--;this.advance();});};
   signal.addEventListener('abort',cancel,{once:true});this.waiting.push(start);this.advance();
  });
 }
 private advance(){while(this.active<2&&this.waiting.length)this.waiting.shift()!();}
 private remove(id:string){const entry=this.entries.get(id);if(!entry)return;this.entries.delete(id);entry.abort.abort();if(entry.url)this.revoke(entry.url);}
 dispose(){for(const id of this.entries.keys())this.remove(id);}
}
