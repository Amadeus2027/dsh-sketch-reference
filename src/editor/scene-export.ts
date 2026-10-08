import type {Drawing} from '../core/contracts.ts';

/** One immutable autosave snapshot only; a failed export can always be retried. */
export function createSceneExport(exporter:(scene:Drawing['scene'])=>Promise<Blob>) {
 let snapshot:Drawing['scene']|undefined,result:Promise<Blob>|undefined;
 return (scene:Drawing['scene']):Promise<Blob>=>{
  if(snapshot===scene&&result)return result;
  snapshot=scene;
  const pending=exporter(scene).catch(error=>{if(result===pending){snapshot=undefined;result=undefined;}throw error;});
  result=pending;return pending;
 };
}
