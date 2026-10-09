import type {Drawing} from '../core/contracts.ts';

/** One immutable autosave snapshot only; a failed export can always be retried. */
export function createSceneExport(exporter:(scene:Drawing['scene'])=>Promise<Blob>) {
 let snapshot:Drawing['scene']|undefined;
 const results=new Map<string,Promise<Blob>>();
 return (scene:Drawing['scene'],elementIds?:readonly string[]):Promise<Blob>=>{
  if(snapshot!==scene){snapshot=scene;results.clear();}
  const key=elementIds?JSON.stringify(elementIds):'all',cached=results.get(key);if(cached)return cached;
  const ids=elementIds?new Set(elementIds):null;
  const selected=ids?{...scene,elements:scene.elements.filter(e=>!e.isDeleted&&ids.has(e.id))}:scene;
  if(ids&&(!ids.size||selected.elements.length!==ids.size))return Promise.reject(new Error('重点元素已变化，请重新设置选区'));
  // Keep the full image and at most one selected image per immutable snapshot.
  if(ids)for(const existing of results.keys())if(existing!=='all')results.delete(existing);
  const pending=exporter(selected).catch(error=>{if(results.get(key)===pending)results.delete(key);throw error;});
  results.set(key,pending);return pending;
 };
}
