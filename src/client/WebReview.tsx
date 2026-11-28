import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ownerKey,type Owner} from '../core/contracts.ts';
import {WebRegionSelector,type Region} from './WebRegionSelector.tsx';
import {useWebPreview} from './use-web-preview.ts';
import {restoreWebDraft,selectedRegion,targetAt,reviewInstruction} from './web-annotation.ts';
import type {WebFiles} from './web-files.ts';
import css,{mountStyles} from './WebReview.module.css';

export function WebReview({owner,read,onBack,onInsert}:{owner:Owner;read:WebFiles;onBack:()=>void;onInsert:(text:string,signal:AbortSignal)=>Promise<void>}){
 const key='dsh-web-review:v1:'+ownerKey(owner);
 const [draft,setDraft]=useState(()=>restoreWebDraft(key));
 // Persist only successfully opened paths. Typing or a failed read leaves the current draft intact.
 const [pathInput,setPathInput]=useState(draft.path);
 const {page,busy,error,setError,read:load}=useWebPreview(owner,read,draft.path);
 const editingPath=!!page&&pathInput!==page.path;
 const [marking,setMarking]=useState(false),[loaded,setLoaded]=useState(false);
 const note=useRef<HTMLInputElement>(null);
 const frame=useRef<HTMLIFrameElement>(null);
 const [view,setView]=useState({width:0,height:0,x:0,y:0});
 const [storageError,setStorageError]=useState(false);
 useLayoutEffect(()=>mountStyles(),[]);
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{setStorageError(true);}},[draft,key]);
 useLayoutEffect(()=>{
  setLoaded(false);
  setMarking(false);
 },[page?.revision]);
 const open=()=>load(pathInput,next=>{
  setPathInput(next.path);
  setDraft(old=>old.path===next.path?old:{...old,path:next.path});
 });
 const cancelPath=()=>{if(page){setPathInput(page.path);setError('');}};
 const submit=()=>load(draft.path,(next,signal)=>onInsert(reviewInstruction(draft,next,frame.current),signal));
 useEffect(()=>{
  const win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!loaded||!win||!doc)return;
  const sync=()=>setView({width:win.innerWidth,height:win.innerHeight,x:win.scrollX,y:win.scrollY});
  const resize=new ResizeObserver(sync);resize.observe(frame.current!);win.addEventListener('scroll',sync);sync();
  return ()=>{resize.disconnect();win.removeEventListener('scroll',sync);};
 },[loaded,page]);
 const select=(gesture:Region,pointerType:string)=>{
  const win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!page||!win||!doc)return;
  const region=selectedRegion(doc,gesture);
  if(!region){setError('请点击页面元素，或拖动圈出区域');return;}
  const {x,y,w,h}=region;
  const target=targetAt(doc,x+w/2,y+h/2);
  if(!target){setError('未找到目标，请重新圈选');return;}
  setDraft(old=>({...old,mark:{revision:page.revision,path:page.path,x:x+win.scrollX,y:y+win.scrollY,w,h,width:win.innerWidth,height:win.innerHeight,scrollX:win.scrollX,scrollY:win.scrollY,target}}));setError('');
  if(pointerType==='mouse')note.current?.focus({preventScroll:true});
 };
 const mark=draft.mark;
 const current=!!page&&!!mark&&mark.path===page.path&&mark.revision===page.revision&&mark.width===view.width&&mark.height===view.height;
 const canSubmit=current&&!busy&&!editingPath&&!!draft.note.trim();
 const saved=current?{x:mark.x-view.x,y:mark.y-view.y,w:mark.w,h:mark.h}:null;
 const guidance=storageError?'本标签页暂时无法保存批注草稿':editingPath?'打开新网页，或取消后继续批注':mark&&!current?'网页或视口已变化，请重新圈选':current?'已选区域 · 填写意见后加入聊天':marking?'点击元素，或拖动圈出区域':'选择「圈选区域」开始批注';
 return <section className={css.webReview} aria-label="网页批注">
  <header>
   <strong>网页批注</strong>
   {page&&<div className={css.webModes} role="group" aria-label="预览模式">
    <button type="button" aria-pressed={!marking} onClick={()=>setMarking(false)}>浏览</button>
    <button type="button" aria-pressed={marking} disabled={!loaded||busy} onClick={()=>setMarking(true)}>圈选区域</button>
   </div>}
   <button className={css.back} onClick={onBack}>返回草图</button>
  </header>
  <form className={css.location} onSubmit={e=>{e.preventDefault();void open();}}>
   <input aria-label="工作区 HTML 路径" placeholder="例如 index.html 或 pages/home.html" autoFocus={!draft.path} value={pathInput} maxLength={512} disabled={busy}
    onChange={e=>setPathInput(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&editingPath){e.preventDefault();cancelPath();}}}/>
   {editingPath&&<button type="button" aria-label="取消更改路径" disabled={busy} onClick={cancelPath}>取消</button>}
   <button disabled={busy||!pathInput.trim()}>{busy?'读取中…':page?.path===pathInput?'刷新网页':'打开网页'}</button>
  </form>
  <div className={css.webViewport}>{page&&<iframe key={page.revision} ref={frame} sandbox="allow-same-origin" referrerPolicy="no-referrer" title="网页排版预览" srcDoc={page.html} onLoad={()=>{setLoaded(true);if(mark?.revision===page.revision)frame.current?.contentWindow?.scrollTo(mark.scrollX,mark.scrollY);}}/>}
   {!page&&<div className={css.empty} role="status">{busy?'正在载入网页…':error||'输入当前工作区的 HTML 文件路径'}</div>}
   {marking&&<WebRegionSelector saved={saved} disabled={busy} onSelect={select}/>}
  </div>
  {page&&<footer>
   <label htmlFor="web-review-note">修改意见</label>
   <form className={css.composer} onSubmit={event=>{event.preventDefault();if(canSubmit)void submit();}}>
    <input ref={note} id="web-review-note" value={draft.note} maxLength={1500} disabled={busy} onChange={e=>setDraft({...draft,note:e.target.value})} placeholder="例如：把圈出的搜索框移到右侧"/>
    <button className={css.primary} disabled={!canSubmit} type="submit">加入当前聊天</button>
   </form>
   <div className={css.statusRow}>
    <small role="status" data-error={!!error}>{error||guidance}</small>
    {page?.hasScript&&<small>静态预览 · 脚本未运行</small>}
   </div>
  </footer>}
 </section>;
}
