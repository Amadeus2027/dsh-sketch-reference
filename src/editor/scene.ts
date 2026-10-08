import {sceneSchema,type Drawing} from '../core/contracts.ts';
export function normalize(elements:readonly unknown[],appState:Record<string,unknown>):Drawing['scene'] {
 const state:Record<string,unknown>={viewBackgroundColor:'#ffffff'};
 for(const key of ['gridSize','gridStep','gridModeEnabled'])if(appState[key]!==undefined)state[key]=appState[key];
 const active=elements.filter(e=>!(e as {isDeleted?:boolean}).isDeleted).map(e=>{
  const bindings=(e as {boundElements?:unknown}).boundElements;
  // Excalidraw restores null as []; both mean no bound elements.
  return Array.isArray(bindings)&&!bindings.length?{...(e as object),boundElements:null}:e;
 });
 return sceneSchema.parse({elements:JSON.parse(JSON.stringify(active)),appState:state,files:{}});
}
