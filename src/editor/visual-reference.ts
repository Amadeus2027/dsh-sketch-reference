import {useCallback,useEffect,useRef,useState} from 'react';
import type {Owner} from '../core/contracts.ts';
import {visualStateSchema,type VisualState} from '../core/visual.ts';
import {rpc} from './rpc.ts';

export function useVisualReference(owner:Owner){
 const [state,setState]=useState<VisualState|null>(null),[error,setError]=useState('');
 const active=useRef(true),abort=useRef(new AbortController()),epoch=useRef(0);
 const refresh=useCallback(async()=>{const generation=++epoch.current;
  try{const value=visualStateSchema.parse(await rpc('visual/get',owner,null,abort.current.signal));if(active.current&&generation===epoch.current){setState(value);setError('');}return value;}
  catch(e){if(active.current&&generation===epoch.current)setError(e instanceof Error?e.message:'视觉参考状态暂不可用');throw e;}
 },[owner]);
 useEffect(()=>{active.current=true;void refresh().catch(()=>{});return()=>{active.current=false;abort.current.abort();};},[refresh]);
 return {state,error,refresh,accept:(value:unknown)=>{epoch.current++;if(active.current){setState(visualStateSchema.parse(value));setError('');}}};
}
