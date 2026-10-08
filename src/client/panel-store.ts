/** One observable per plugin generation, bound by the native Slot hooks API. */
export function createPanelStore(){
 let snapshot:Readonly<Record<string,boolean>>=Object.freeze({});
 const listeners=new Set<()=>void>(),closing=new Set<(id:string)=>void>();
 const publish=(next:Record<string,boolean>)=>{snapshot=Object.freeze(next);for(const listener of listeners)listener();};
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  set(id:string,value:boolean){if(!!snapshot[id]===value)return;const next={...snapshot};if(value)next[id]=true;else delete next[id];publish(next);},
  requestClose(id:string){for(const listener of closing)listener(id);},
  onClose(listener:(id:string)=>void){closing.add(listener);return()=>{closing.delete(listener);};},
  prune(ids:readonly string[]){const live=new Set(ids),next=Object.fromEntries(Object.entries(snapshot).filter(([id])=>live.has(id)));if(Object.keys(next).length!==Object.keys(snapshot).length)publish(next);},
  clear(){publish({});listeners.clear();closing.clear();}
 };
}
