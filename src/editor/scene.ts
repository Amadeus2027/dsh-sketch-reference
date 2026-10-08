import {sceneSchema,type Drawing} from '../core/contracts.ts';
export function normalize(elements:readonly unknown[],appState:Record<string,unknown>):Drawing['scene'] {
 const state:Record<string,unknown>={viewBackgroundColor:'#ffffff'};
 for(const key of ['gridSize','gridStep','gridModeEnabled'])if(appState[key]!==undefined)state[key]=appState[key];
 return sceneSchema.parse({elements:JSON.parse(JSON.stringify(elements.filter(e=>!(e as {isDeleted?:boolean}).isDeleted))),appState:state,files:{}});
}
