import {afterEach,expect,it,vi} from 'vitest';
import {captureView,readView,writeView} from '../src/editor/view-state.ts';
import {ownerKey,type Owner} from '../src/core/contracts.ts';
const owner:Owner={sessionId:'view',createdAt:'2026-10-11',cwd:'/workspace'};
const view={zoom:{value:.65},scrollX:37,scrollY:-89};
afterEach(()=>vi.unstubAllGlobals());
it('restores only zoom and scroll for the complete session identity',()=>{
 const store=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)});
 expect(captureView({...view,zoom:{value:.65,other:'ignored'},selectedElementIds:{private:true}})).toEqual(view);
 writeView(owner,view);expect(readView(owner)).toEqual(view);
 for(const different of [{...owner,sessionId:'other'},{...owner,createdAt:'new'},{...owner,cwd:'/other'}])expect(readView(different)).toBeNull();
});
it('rejects corrupted or out-of-range view preferences without touching drawing data',()=>{
 const key='dsh-sketch-view:v1:'+encodeURIComponent(ownerKey(owner));let value='invalid JSON';
 vi.stubGlobal('localStorage',{getItem:(k:string)=>k===key?value:null});
 expect(readView(owner)).toBeNull();value=JSON.stringify({...view,zoom:{value:0}});expect(readView(owner)).toBeNull();
 expect(captureView({...view,scrollX:Infinity})).toBeNull();expect(captureView({...view,zoom:{value:31}})).toBeNull();
});
it('keeps closing and drawing available when preference storage is denied or full',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('quota');}});
 expect(readView(owner)).toBeNull();expect(()=>writeView(owner,view)).not.toThrow();expect(()=>writeView(owner,null)).not.toThrow();
});
