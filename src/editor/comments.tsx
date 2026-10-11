import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {getCommonBounds,sceneCoordsToViewportCoords} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {anchorTarget,type CommentView} from '../core/comments.ts';
import type {CommentStatus} from '../core/contracts.ts';
import type {CommentRequest} from '../core/comment-context.ts';

const commentNumber=(index:number)=>index<20?String.fromCodePoint(0x2460+index):String(index+1);
export interface CommentActions {
 select:(id:string,locate:boolean)=>void;
 hover:(id:string|null)=>void;
 discuss:(id:string,intent:CommentRequest['intent'])=>void;
 change:(id:string,status:CommentStatus)=>void;
 use:(index:number)=>void;
 prompt:(index:number)=>void;
}
interface Props {batch:CommentView;selected:string|null;stale:boolean;showIgnored:boolean;actions:CommentActions;missing:Set<string>}
function CommentToolbar({batch,id,stale,saving,actions}:{batch:CommentView;id:string;stale:boolean;saving:boolean;actions:CommentActions}) {
 const menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menuId=useId();
 const clickedWhileOpen=useRef(false);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  const node=menu.current;if(!node)return;
  const changed=()=>setOpen(node.matches(':popover-open'));
  node.addEventListener('toggle',changed);return()=>node.removeEventListener('toggle',changed);
 },[]);
 const toggle=()=>{
  const node=menu.current,button=trigger.current;if(!node||!button)return;
  if(node.matches(':popover-open')||clickedWhileOpen.current){clickedWhileOpen.current=false;node.hidePopover();return;}
  node.showPopover();
  const anchor=button.getBoundingClientRect(),bounds=node.getBoundingClientRect();
  node.style.left=Math.max(8,Math.min(anchor.right-bounds.width,window.innerWidth-bounds.width-8))+'px';
  node.style.top=Math.max(8,Math.min(anchor.bottom+4,window.innerHeight-bounds.height-8))+'px';
  node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 };
 const comment=batch.comments.find(c=>c.id===id)!;
 const suggestion=batch.advice.suggestions[comment.suggestionIndex]!;
 return <><button ref={trigger} className="commentMenuTrigger" aria-label="批注操作" title="批注操作" aria-expanded={open} aria-controls={menuId} onPointerDown={()=>{clickedWhileOpen.current=menu.current?.matches(':popover-open')??false;}} onClick={toggle}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></svg></button>
 <div ref={menu} id={menuId} {...{popover:'auto'}} className="commentActions" role="group" aria-label="在原生聊天中讨论批注" aria-busy={saving} onClick={e=>{if((e.target as Element).closest('button')){menu.current?.hidePopover();trigger.current?.focus();}}}>
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'ask')}>追问</button>
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'correct')}>纠正</button>
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'edit')}>修改这里</button>
  {suggestion.actionPrompt&&<><button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.use(comment.suggestionIndex)}>使用建议</button>
  <button aria-label="查看指令" onClick={()=>actions.prompt(comment.suggestionIndex)}>指令</button></>}
  <button disabled={saving} aria-label={comment.status==='open'?'标记已解决':'重新打开'} onClick={()=>actions.change(id,comment.status==='open'?'resolved':'open')}>{comment.status==='open'?'解决':'重新打开'}</button>
  {comment.status!=='ignored'&&<button disabled={saving} aria-label="忽略批注" onClick={()=>actions.change(id,'ignored')}>忽略</button>}
  {saving&&<span className="commentPending" role="status">请等待当前操作</span>}
 </div></>;
}
export function CommentList({batch,selected,stale,showIgnored,actions,missing}:Props){
 const items=batch.comments.filter(c=>showIgnored||c.status!=='ignored');
 const [start,setStart]=useState(0),last=Math.max(0,Math.floor((items.length-1)/3)*3),offset=Math.min(start,last);
 useEffect(()=>setStart(0),[batch.id]);
 useEffect(()=>{const index=batch.comments.filter(c=>showIgnored||c.status!=='ignored').findIndex(c=>c.id===selected);if(index>=0)setStart(Math.floor(index/3)*3);},[selected,batch.id,showIgnored]);
 const arrow=(direction:'left'|'right')=><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={direction==='left'?'m10 4-4 4 4 4':'m6 4 4 4-4 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
 return <div className="commentCarousel">
 {items.length>3&&<button className="commentPage" aria-label="上一组批注" title="上一组批注" disabled={offset===0} onClick={()=>setStart(Math.max(0,offset-3))}>{arrow('left')}</button>}
 <div className="cards" data-stale={stale}>
 {items.slice(offset,offset+3).map(c=>{
  const suggestion=batch.advice.suggestions[c.suggestionIndex]!,expanded=selected===c.id;
  return <article key={c.id} className={`commentCard ${c.status} ${expanded?'active':''}`} data-comment-id={c.id}
   onMouseEnter={()=>actions.hover(c.id)} onMouseLeave={()=>actions.hover(null)}
   onFocus={()=>actions.hover(c.id)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))actions.hover(null);}}
   onClick={e=>{if(!(e.target as Element).closest('button,a,input,textarea,select'))actions.select(expanded?'':c.id,true);}}>
   <h2><button className="commentHeading" aria-label={`${commentNumber(c.suggestionIndex)} ${suggestion.title}`} aria-expanded={expanded} onClick={()=>actions.select(expanded?'':c.id,true)}><span className="commentNumber" aria-hidden="true">{c.suggestionIndex+1}</span><span>{suggestion.title}</span></button></h2>
   {(missing.has(c.id)||stale||c.status!=='open')&&<small>{missing.has(c.id)?'对应图形已删除':stale?'批注已失效，请刷新':c.status==='resolved'?'已解决':'已忽略'}</small>}
  </article>;
 })}
 </div>
 {items.length>3&&<button className="commentPage" aria-label="下一组批注" title="下一组批注" disabled={offset===last} onClick={()=>setStart(Math.min(last,offset+3))}>{arrow('right')}</button>}
 </div>;}

interface Marker {id:string;index:number;x:number;y:number;left:number;top:number;width:number;height:number;status:CommentStatus;kind:'element'|'global'|'missing';outside:boolean}
/** Official element bounds + viewport conversion. The layer never adds scene elements. */
export function CommentOverlay({api,batch,selected,hovered,stale,saving,shown,showIgnored,missing,disabled,actions,onMissing}:{api:ExcalidrawImperativeAPI|null;batch:CommentView;selected:string|null;hovered:string|null;stale:boolean;saving:boolean;shown:boolean;showIgnored:boolean;missing:Set<string>;disabled:boolean;actions:CommentActions;onMissing:(ids:Set<string>)=>void}) {
 const root=useRef<HTMLDivElement>(null);
 const box=useRef(''),invalidate=useRef<(()=>void)|null>(null);
 const refreshOffsets=()=>{
  if(!api||!root.current)return false;
  const rect=root.current.getBoundingClientRect(),key=[rect.left,rect.top,rect.width,rect.height].join(':');
  if(key===box.current)return false;
  box.current=key;api.refresh();return true;
 };
 // Parent notices/cards can move the editor without a window resize.
 useLayoutEffect(()=>{if(refreshOffsets())invalidate.current?.();});
 const [layout,setLayout]=useState<{markers:Marker[];width:number;height:number}>({markers:[],width:0,height:0});
 useEffect(()=>{
  if(!api||!root.current)return;
  let frame=0;let closed=false;
  const measure=()=>{
   frame=0;if(closed||!root.current)return;
   if(refreshOffsets()){schedule();return;}
   const rect=root.current.getBoundingClientRect(),elements=api.getSceneElements(),map=new Map(elements.map(e=>[e.id,e])),state=api.getAppState();
   const markers:Marker[]=[],missing=new Set<string>(),stacked=new Map<string,number>();let globalIndex=0;
   for(const comment of batch.comments){
    const anchor=batch.advice.suggestions[comment.suggestionIndex]?.anchor;
    const element=anchorTarget(anchor,elements);
    if(anchor&&!element)missing.add(comment.id);
    if(comment.status==='ignored')continue;
    if(!element){const columns=Math.max(1,Math.floor((rect.width-48)/32)),slot=globalIndex++;markers.push({id:comment.id,index:comment.suggestionIndex,x:Math.max(16,rect.width-32-(slot%columns)*32),y:66+Math.floor(slot/columns)*32,left:0,top:0,width:0,height:0,status:comment.status,kind:anchor?'missing':'global',outside:false});continue;}
    const [left,top,right,bottom]=getCommonBounds([element],map);
    const start=sceneCoordsToViewportCoords({sceneX:left,sceneY:top},state),end=sceneCoordsToViewportCoords({sceneX:right,sceneY:bottom},state);
    const position=sceneCoordsToViewportCoords({sceneX:right,sceneY:top},state);
    const ordinal=stacked.get(element.id)??0;stacked.set(element.id,ordinal+1);
    const rawX=position.x-rect.left,rawY=position.y-rect.top,outside=rawX<14||rawY<14||rawX>rect.width-14||rawY>rect.height-14;
    const edgeX=Math.max(14,Math.min(rawX,rect.width-14));
    const x=Math.max(14,Math.min(outside?edgeX+(edgeX<rect.width/2?ordinal*30:-ordinal*30):rawX-ordinal*30,rect.width-14)),y=Math.max(14,Math.min(rawY,rect.height-14));
    markers.push({id:comment.id,index:comment.suggestionIndex,x,y,left:start.x-rect.left,top:start.y-rect.top,width:end.x-start.x,height:end.y-start.y,status:comment.status,kind:'element',outside});
   }
   setLayout(previous=>previous.width===rect.width&&previous.height===rect.height&&previous.markers.length===markers.length&&markers.every((m,i)=>{const old=previous.markers[i];return old&&Object.keys(m).every(key=>m[key as keyof Marker]===old[key as keyof Marker]);})?previous:{markers,width:rect.width,height:rect.height});onMissing(missing);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  invalidate.current=schedule;
  const offChange=api.onChange(schedule),offScroll=api.onScrollChange(schedule);
  const observer=new ResizeObserver(schedule);observer.observe(root.current);
  // Changes to the advice area also move the canvas without resizing the window.
  window.addEventListener('resize',schedule);schedule();
  return()=>{closed=true;invalidate.current=null;cancelAnimationFrame(frame);offChange();offScroll();observer.disconnect();window.removeEventListener('resize',schedule);};
 },[api,batch,onMissing]);
 const current=layout.markers.find(m=>m.id===selected),selectedComment=batch.comments.find(c=>c.id===selected);
 const emphasis=layout.markers.find(m=>m.id===(hovered??selected));
 const visible=(m:Marker)=>m.x>=0&&m.y>=0&&m.x<=layout.width&&m.y<=layout.height;
 const popoverWidth=Math.max(0,Math.min(320,layout.width-16));
 const missingSelected=!!selectedComment&&missing.has(selectedComment.id);
 return <div className="commentOverlay" ref={root} data-stale={stale} style={{visibility:disabled?'hidden':'visible'}} onKeyDown={e=>e.stopPropagation()}>
  {emphasis?.kind==='element'&&<div className="commentHighlight" aria-hidden="true" data-comment-id={emphasis.id} style={{left:emphasis.left-5,top:emphasis.top-5,width:Math.max(1,emphasis.width)+10,height:Math.max(1,emphasis.height)+10}}/>}
  {shown&&layout.markers.filter(visible).map(m=><button key={m.id} className={`commentMarker ${m.status} ${selected===m.id?'active':''}`} style={{left:m.x,top:m.y}} data-comment-id={m.id} data-kind={m.kind} data-outside={m.outside} aria-label={`批注${commentNumber(m.index)}`} aria-expanded={selected===m.id} title={`${stale?'基于较早草图 · ':''}${m.kind==='global'?'全局批注 · ':m.kind==='missing'?'图形已删除 · ':m.outside?'视野外图形，点击定位 · ':''}${batch.advice.suggestions[m.index]?.title??''}`} onPointerDown={e=>e.stopPropagation()} onMouseEnter={()=>actions.hover(m.id)} onMouseLeave={()=>actions.hover(null)} onClick={()=>actions.select(selected===m.id?'':m.id,m.outside)}>{m.index+1}</button>)}
  {shown&&selectedComment&&(showIgnored||selectedComment.status!=='ignored')&&(!current||visible(current))&&<aside className="commentPopover" role="dialog" aria-label={`批注详情${commentNumber(selectedComment.suggestionIndex)}`} style={{width:popoverWidth,left:Math.max(8,Math.min((current?.x??layout.width-popoverWidth-24)+16,layout.width-popoverWidth-8)),top:Math.max(8,Math.min((current?.y??0)+16,layout.height-220)),maxHeight:Math.max(0,layout.height-Math.max(8,Math.min((current?.y??0)+16,layout.height-220))-8)}} onPointerDown={e=>e.stopPropagation()}>
   <div><strong><span className="commentNumber" aria-hidden="true">{selectedComment.suggestionIndex+1}</span> {batch.advice.suggestions[selectedComment.suggestionIndex]!.title}</strong><CommentToolbar key={selectedComment.id} batch={batch} id={selectedComment.id} stale={stale||missingSelected} saving={saving} actions={actions}/><button aria-label="收起批注" onClick={()=>actions.select('',false)}>×</button></div>
   {stale&&<small>批注基于较早草图，定位仅供参考。</small>}
   {missingSelected&&<small>对应图形已删除，无法定位。</small>}
   {!batch.advice.suggestions[selectedComment.suggestionIndex]!.anchor&&<small>全局批注</small>}
   <p>{batch.advice.suggestions[selectedComment.suggestionIndex]!.reason}</p>
  </aside>}
 </div>;
}
