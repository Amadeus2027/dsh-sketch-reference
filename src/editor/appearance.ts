import {useSyncExternalStore} from 'react';
import type {Appearance} from '../core/appearance.ts';
const listeners=new Set<()=>void>();
let current:Appearance={theme:new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light',fontFamily:'system-ui, sans-serif',colors:{}};
export function applyAppearance(value:Appearance){
 const root=document.documentElement;root.dataset.theme=value.theme;root.style.colorScheme=value.theme;root.style.setProperty('--sketch-font',value.fontFamily);
 for(const key of ['background','surface','text','muted','border','accent','hover','primary','primaryText'] as const){const color=value.colors[key];if(color)root.style.setProperty('--sketch-'+key,color);else root.style.removeProperty('--sketch-'+key);}
 if(JSON.stringify(current)===JSON.stringify(value))return;
 current=value;for(const listener of listeners)listener();
}
export function initializeAppearance(){applyAppearance(current);}
export function useAppearance(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>current);}
