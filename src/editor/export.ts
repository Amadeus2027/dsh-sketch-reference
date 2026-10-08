import {IMAGE_LIMITS} from '../core/limits.ts';
import {exportToBlob,serializeAsJSON} from '@excalidraw/excalidraw';
import type {NonDeletedExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import type {AppState} from '@excalidraw/excalidraw/types';
import type {Drawing} from '../core/contracts.ts';
export async function pngExport(scene:Drawing['scene']):Promise<Blob> {
 if(!scene.elements.length)throw new Error('先画一点内容');
 await document.fonts.ready;
 // The schema admits a restricted subset of Excalidraw's serialized elements.
 const elements=scene.elements as unknown as readonly NonDeletedExcalidrawElement[];
 for(const size of [1600,1280,1024]) {
  const blob=await exportToBlob({elements,appState:{...scene.appState,viewBackgroundColor:'#ffffff',exportBackground:true} as Partial<AppState>,files:{},mimeType:'image/png',exportPadding:32,maxWidthOrHeight:size});
  if(blob.size<=IMAGE_LIMITS.maxBytes)return blob;
 }
 throw new Error('图片过大，请精简草图后重试');
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function downloadScene(scene:Drawing['scene']){download(new Blob([serializeAsJSON(scene.elements as unknown as readonly NonDeletedExcalidrawElement[],scene.appState as Partial<AppState>,{},'local')],{type:'application/json'}),'sketch-reference.excalidraw');}
export async function base64(blob:Blob):Promise<string>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
