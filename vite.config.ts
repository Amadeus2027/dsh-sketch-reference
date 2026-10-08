import { defineConfig } from 'vite';
/** Excalidraw 0.18.1 unconditionally appends an esm.sh font fallback.
 * Replace only that fallback at build time so all sources remain local.
 */
export default defineConfig({root:'src/editor',base:'./',publicDir:false,plugins:[{
 name:'sketch-local-font-fallback',
 transform(code,id){
  if(!id.includes('@excalidraw/excalidraw/dist/prod/chunk-')||!code.includes('https://esm.sh/'))return null;
  const start=code.indexOf('`https://esm.sh/');
  const tail='/dist/prod/`',end=code.indexOf(tail,start);
  if(start<0||end<start)throw new Error('Excalidraw fallback format changed; re-audit the local font adapter');
  const patched=code.slice(0,start)+'new URL("/sketch-reference-assets/",window.location.origin).href'+code.slice(end+tail.length);
  return {code:patched,map:null};
 }
}],build:{outDir:'../../lib/editor',emptyOutDir:true,target:'es2022',sourcemap:false,cssCodeSplit:false}});
