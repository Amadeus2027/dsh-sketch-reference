import {sceneSchema,type Drawing} from '../core/contracts.ts';
export function normalize(elements:readonly unknown[],appState:Record<string,unknown>,previous?:Drawing['scene']):Drawing['scene'] {
 const state:Record<string,unknown>={viewBackgroundColor:'#ffffff'};
 for(const key of ['gridSize','gridStep','gridModeEnabled'])if(appState[key]!==undefined)state[key]=appState[key];
 const strokes=new Map(previous?.elements.filter(e=>e.type==='freedraw').map(e=>[e.id,e]));
 const active=elements.filter(e=>!(e as {isDeleted?:boolean}).isDeleted).map(e=>{
  const element=e as {id:string;type:string;boundElements?:unknown};
  // Excalidraw restores null as []; both mean no bound elements.
  let normalized=Array.isArray(element.boundElements)&&!element.boundElements.length?{...(e as object),boundElements:null}:e;
  // This drawing-in-progress checkpoint is cleared by Excalidraw on restore.
  // New strokes use null; retain older stored values (including absence) so
  // merely opening a legacy scene does not invalidate its revision/references.
  if(element.type==='freedraw')normalized={...(normalized as object),lastCommittedPoint:strokes.has(element.id)?strokes.get(element.id)!.lastCommittedPoint:null};
  return normalized;
 });
 return sceneSchema.parse({elements:JSON.parse(JSON.stringify(active)),appState:state,files:{}});
}
