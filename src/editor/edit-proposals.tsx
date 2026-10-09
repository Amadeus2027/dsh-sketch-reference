import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {proposalSchema,type EditProposal} from '../core/edits.ts';
import type {Owner,Drawing} from '../core/contracts.ts';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {rpc} from './rpc.ts';
import {downloadScene} from './export.ts';

const stateSchema=z.object({available:z.boolean(),unchanged:z.boolean(),proposal:proposalSchema.nullable()}).strict();
const shapeNames={rectangle:'矩形',ellipse:'椭圆',diamond:'菱形',text:'文字',arrow:'箭头'};
export function useEditProposal(owner:Owner){
 const [proposal,setProposal]=useState<EditProposal|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[available,setAvailable]=useState(false);
 const abort=useRef(new AbortController()),mounted=useRef(true),epoch=useRef(0),flight=useRef<Promise<void>|null>(null),again=useRef(false);
 const known=useRef<EditProposal|null>(null);
 const refresh=useCallback(()=>{
  if(flight.current){again.current=true;return flight.current;}
  const task=(async()=>{do{again.current=false;const token=epoch.current;let next:z.infer<typeof stateSchema>;
   try{next=stateSchema.parse(await rpc('proposal/get',owner,known.current?{knownId:known.current.id,knownStatus:known.current.status}:null,abort.current.signal));}catch(e){if(mounted.current&&token!==epoch.current){again.current=true;continue;}throw e;}
   if(!mounted.current)return;if(token!==epoch.current){again.current=true;continue;}setAvailable(next.available);if(next.available){if(!next.unchanged){known.current=next.proposal;setProposal(next.proposal);}setError('');}else if(known.current)setError('修改协作暂不可用；原草图保留，请刷新后再操作。');
  }while(again.current&&mounted.current);})().catch(e=>{if(mounted.current)setError(e instanceof Error?e.message:'修改提议读取失败');}).finally(()=>{flight.current=null;});flight.current=task;return task;
 },[owner]);
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;abort.current.abort();};},[refresh]);
 const dismiss=async()=>{if(!proposal||busy)return;epoch.current++;setBusy(true);try{const next=proposalSchema.parse(await rpc('proposal/dismiss',owner,{proposalId:proposal.id},abort.current.signal));if(mounted.current){epoch.current++;known.current=next;setProposal(next);setError('');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'忽略失败');}finally{if(mounted.current)setBusy(false);}};
 return {proposal,error,busy,available,refresh,dismiss,invalidate:()=>{epoch.current++;}};
}
export interface EditPreview {scene:Drawing['scene'];elements:readonly ExcalidrawElement[];image:Blob}
export function EditPanel({state,disabled,uncertain,onPreview,onApply,onReload,currentRevision,dirty}:{currentRevision:string|null;dirty:boolean;state:ReturnType<typeof useEditProposal>;disabled:boolean;uncertain:boolean;onPreview:(p:EditProposal)=>Promise<EditPreview>;onApply:(p:EditProposal,preview:EditPreview)=>Promise<void>;onReload:()=>void}){
 const {proposal,error,busy,available,refresh,dismiss}=state;
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<EditPreview|null>(null),[image,setImage]=useState(''),[working,setWorking]=useState(false),[message,setMessage]=useState('');
 const alive=useRef(true),selected=useRef(proposal?.id);selected.current=proposal?.id;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{setPreview(null);setMessage('');setOpen(false);},[proposal?.id]);
 useEffect(()=>{if(!preview){setImage('');return;}const url=URL.createObjectURL(preview.image);setImage(url);return()=>URL.revokeObjectURL(url);},[preview]);
 if(!proposal&&!error)return null;
 const run=async(task:()=>Promise<void>)=>{setWorking(true);setMessage('');try{await task();}catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'修改提议操作失败');}finally{if(alive.current)setWorking(false);}};
 const stale=proposal?.status==='pending'&&(dirty||proposal.baseRevision!==currentRevision);
 const blocked=disabled||working||busy;
 return <section className="editPanel" aria-label="Agent 修改提议">
  <div className="editTitle"><button aria-expanded={open} onClick={()=>setOpen(v=>!v)}>修改提议 {open?'⌃':'⌄'}</button><span>{proposal?.summary}</span><small>{proposal?.status==='applied'?'已应用':proposal?.status==='dismissed'?'已忽略':stale?'需重新提议':'待确认'}</small><button disabled={blocked} onClick={()=>void refresh()}>刷新提议</button></div>
  {open&&proposal&&<div className="editBody">
   <p>{stale?'草图或用途已变化，请让 Agent 重新读取后提议。旧提议不能覆盖当前画板。':'仅在点击确认后修改画板。可用原生撤销或修改前备份恢复。'}</p>
   <ol>{proposal.operations.map((op,i)=><li key={i}>{op.op==='create'?`新增${shapeNames[op.type]}${op.text?`：${op.text}`:''}`:op.op==='move'?`移动 ${op.elementId} 至 (${op.x}, ${op.y})`:op.op==='resize'?`调整 ${op.elementId} 尺寸为 ${op.width} × ${op.height}`:`删除 ${op.elementId}`}</li>)}</ol>
   {image&&<img className="editPreview" src={image} alt={proposal.status==='applied'&&!uncertain?'已应用草图预览':'修改后的草图预览（尚未应用）'}/>}
   <div className="commentTools">
    {proposal.status==='pending'&&!uncertain&&<button disabled={blocked||stale||!available} onClick={()=>void run(async()=>{const value=await onPreview(proposal);if(alive.current&&selected.current===proposal.id)setPreview(value);})}>预览修改</button>}
    {preview&&(proposal.status==='pending'||uncertain)&&<button className="primary" disabled={blocked||!available||!!stale&&!uncertain} onClick={()=>void run(async()=>{await onApply(proposal,preview);if(alive.current){setMessage('修改已保存，可使用 Excalidraw 撤销。');void refresh();}})}>{uncertain?'重试确认修改':'确认应用修改'}</button>}
    {proposal.status==='pending'&&!uncertain&&<button disabled={blocked} onClick={()=>void dismiss()}>忽略提议</button>}
    <button onClick={()=>downloadScene(proposal.before)}>下载修改前草稿</button>
   </div>
  </div>}
  {(message||error)&&<div role="alert">{message||error}</div>}
  {uncertain&&<div role="alert">修改结果尚未确认。请重试同一修改，或保留本地备份后载入服务器版本。<button disabled={blocked} onClick={onReload}>载入服务器版本</button></div>}
 </section>;
}
