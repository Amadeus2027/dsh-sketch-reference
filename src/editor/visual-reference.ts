import {useCallback,useEffect,useRef,useState} from 'react';
import type {Owner,Drawing} from '../core/contracts.ts';
import {base64} from './export.ts';
import {visualStateSchema,visualCacheRequest,type VisualState} from '../core/visual.ts';
import {rpc} from './rpc.ts';

export function useVisualReference(owner:Owner){
 const [state,setState]=useState<VisualState|null>(null),[error,setError]=useState('');
 const active=useRef(true),abort=useRef(new AbortController()),epoch=useRef(0);
 const cache=useRef<{key:string;task:Promise<void>}|null>(null);
 const accept=useCallback((value:unknown)=>{epoch.current++;if(active.current){setState(visualStateSchema.parse(value));setError('');}},[]);
 const refresh=useCallback(async()=>{const generation=++epoch.current;
  try{const value=visualStateSchema.parse(await rpc('visual/get',owner,null,abort.current.signal));if(active.current&&generation===epoch.current){setState(value);setError('');}return value;}
  catch(e){if(active.current&&generation===epoch.current)setError(e instanceof Error?e.message:'视觉参考状态暂不可用');throw e;}
 },[owner]);
 useEffect(()=>{active.current=true;void refresh().catch(()=>{});return()=>{active.current=false;abort.current.abort();};},[refresh]);
 const prepareCurrent=useCallback(async(revision:string,scene:Drawing['scene'],exportScene:(scene:Drawing['scene'],ids?:readonly string[])=>Promise<Blob>,valid:()=>boolean)=>{
  try{
   const current=await refresh(),request=visualCacheRequest(current,revision);if(!request||!scene.elements.length)return;
   const {scope,elementIds:ids}=request;
   const key=JSON.stringify([revision,scope,ids??[]]);if(cache.current?.key===key)return await cache.current.task;
   const task=(async()=>{
    const png=await exportScene(scene,ids);if(!valid())throw new Error('草图已变化，等待最新视觉参考');
    abort.current.signal.throwIfAborted();
    accept(await rpc('visual/prepare',owner,{revision,scope,pngBase64:await base64(png)},abort.current.signal));
   })();cache.current={key,task};try{await task;}finally{if(cache.current?.task===task)cache.current=null;}
  }catch(e){if(active.current&&valid())setError('视觉参考尚未更新，可在更多操作中重试。');throw e;}
 },[owner,refresh,accept]);
 return {state,error,refresh,accept,prepareCurrent};
}
