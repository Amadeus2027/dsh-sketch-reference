import {expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

it('preserves distribution checks and rejects bare editor imports in every JS chunk',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sketch-distribution-'));
 const put=async(path:string,value:string)=>{const file=join(root,path);await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,value);};
 const check=()=>spawnSync(process.execPath,[resolve('build/check-distribution.mjs'),root],{encoding:'utf8'});
 try{
  await put('package.json',JSON.stringify({files:['lib','third_party_licenses','THIRD_PARTY_NOTICES.md'],dependencies:{zod:'4'}}));
  for(const path of ['lib/index.js','lib/client.js','lib/types/index.d.ts','LICENSE','THIRD_PARTY_NOTICES.md'])await put(path,'// fixture');
  await put('lib/editor/index.html','<script src="./assets/index.js"></script><link href="./assets/style.css">');
  await put('lib/editor/assets/index.js','import "./lazy/chunk.js";');await put('lib/editor/assets/style.css','body{}');
  for(const family of ['Excalifont','Xiaolai','Virgil','Cascadia','Assistant','ComicShanns','Liberation','Lilita','Nunito'])await put(`lib/editor/fonts/${family}/font.woff2`,'fixture');
  await put('lib/editor/assets/lazy/chunk.js','export {x} from "../shared.js"; const example="import x from \'@xyflow/react\'"; /* import "bad"; */');
  expect(check().status).toBe(0);
  for(const source of ['import "@xyflow/react";','export {x} from "@excalidraw/excalidraw";','import("@excalidraw/element");','require("react");','import(`@xyflow/system`);']){
   await put('lib/editor/assets/lazy/chunk.js',source);const result=check();expect(result.status).not.toBe(0);expect(result.stderr).toContain('bare import');expect(result.stderr).toContain('chunk.js');
  }
  await put('lib/editor/assets/lazy/chunk.js','export const x=1;');await put('lib/client.js','import "@xyflow/react";');expect(check().stderr).toContain('Unbundled editor runtime import');
  await put('lib/client.js','export {};');await put('lib/editor/assets/index.js','');expect(check().stderr).toContain('Invalid editor asset');
 }finally{if(!resolve(root).startsWith(join(resolve(tmpdir()),'sketch-distribution-')))throw Error('Unexpected fixture path');await rm(root,{recursive:true,force:true});}
},30000);
