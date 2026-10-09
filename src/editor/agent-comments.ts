import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {agentBatchSchema,AGENT_EVENTS,type AgentBatch} from '../core/agent.ts';
import {contentDigest,type Owner,type CommentUpdate,type CommentStatus,type Drawing} from '../core/contracts.ts';
import {adviceIsStale} from '../core/comments.ts';
import {rpc} from './rpc.ts';

const stateSchema=z.object({available:z.boolean(),batch:agentBatchSchema.nullable()}).strict();
/** One live connection per open board; events coalesce into bounded reads. */
export function subscribeAgentComments(owner:Owner,changed:()=>void,failed:()=>void){
 const stream=new EventSource(`${AGENT_EVENTS}?${new URLSearchParams(owner)}`);
 stream.onmessage=event=>{if(event.data==='changed')changed();};
 stream.onerror=()=>{stream.close();failed();};
 return()=>stream.close();
}
export function useAgentComments(owner:Owner,scene:()=>Drawing['scene'],goal:()=>string){
 const [batch,setBatch]=useState<AgentBatch|null>(null),[available,setAvailable]=useState(false),[stale,setStale]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[disconnected,setDisconnected]=useState(false),[connectionEpoch,setConnectionEpoch]=useState(0);
 const [pending,setPending]=useState<CommentUpdate|null>(null);
 const pendingRef=useRef<CommentUpdate|null>(null),batchRef=useRef(batch),current=useRef({scene,goal});current.current={scene,goal};batchRef.current=batch;
 const savingRef=useRef(false),writeEpoch=useRef(0);
 const mounted=useRef(true),abort=useRef(new AbortController()),generation=useRef(0);
 const setCurrent=useCallback(async(next:AgentBatch|null)=>{
  if(!mounted.current)return;const previous=batchRef.current;setBatch(next);batchRef.current=next;
  // Status writes and reconnect reads do not re-hash an unchanged analysis snapshot.
  if(previous&&next&&previous.contentDigest===next.contentDigest&&previous.goal===next.goal)return;
  const token=++generation.current,value=next?await contentDigest(current.current.scene()):null;
  if(mounted.current&&token===generation.current)setStale(adviceIsStale(next,value,current.current.goal()));
 },[]);
 const flight=useRef<Promise<boolean>|null>(null),again=useRef(false);
 const refresh=useCallback(()=>{
  if(flight.current){again.current=true;return flight.current;}
  const work=async()=>{
   let confirmed=false;
   do{
    again.current=false;const epoch=writeEpoch.current;
    let next:z.infer<typeof stateSchema>;
    try{next=stateSchema.parse(await rpc('agent/get',owner,null,abort.current.signal));}
    catch(e){if(mounted.current&&epoch!==writeEpoch.current){again.current=true;continue;}throw e;}
    if(!mounted.current)return false;
    // A delayed read must not overwrite a newer confirmed state write.
    if(epoch!==writeEpoch.current){again.current=true;continue;}
    confirmed=next.available;setAvailable(next.available);
    if(next.available)await setCurrent(next.batch);
    else if(pendingRef.current)setError('Agent 工具暂不可用，批注状态尚未确认，请稍后刷新或重试。');
   }while(again.current&&mounted.current);
   return mounted.current&&confirmed;
  };
  const task=work().catch(e=>{if(mounted.current)setError(e instanceof Error?e.message:'Agent 批注载入失败');return false;}).finally(()=>{flight.current=null;});flight.current=task;return task;
 },[owner,setCurrent]);
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;abort.current.abort();};},[refresh]);
 useEffect(()=>{
  if(!available)return;
  setDisconnected(false);return subscribeAgentComments(owner,()=>{void refresh();},()=>{if(mounted.current)setDisconnected(true);});
 },[owner,available,refresh,connectionEpoch]);
 const save=async(input:CommentUpdate)=>{
  savingRef.current=true;writeEpoch.current++;setSaving(true);setError('');
  try{
   const next=agentBatchSchema.parse(await rpc('agent/update',owner,input,abort.current.signal));
   if(mounted.current){writeEpoch.current++;pendingRef.current=null;setPending(null);await setCurrent(next);}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Agent 批注保存失败');}
  finally{savingRef.current=false;if(mounted.current)setSaving(false);}
 };
 return {batch,available,stale,setStale:(value:boolean)=>{generation.current++;setStale(value);},saving,error,disconnected,pending,
  change:(commentId:string,status:CommentStatus)=>{
   const value=batchRef.current;if(!value||pendingRef.current)return;
   const input:CommentUpdate={batchId:value.id,expectedRevision:value.commentRevision,mutationId:crypto.randomUUID(),commentId,status};
   pendingRef.current=input;setPending(input);void save(input);
  },
  retry:()=>{if(pendingRef.current&&!savingRef.current)void save(pendingRef.current);},
  refresh:async()=>{
   if(savingRef.current)return;const selected=pendingRef.current;
   const confirmed=await refresh();
   // Failed reads and mutations started during a refresh retain close protection.
   if(!confirmed||!mounted.current||savingRef.current||pendingRef.current!==selected)return;
   pendingRef.current=null;setPending(null);setError('');if(disconnected)setConnectionEpoch(v=>v+1);
  },
 };
}
