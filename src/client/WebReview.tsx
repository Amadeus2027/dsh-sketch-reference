import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ownerKey,type Owner} from '../core/contracts.ts';
import {WebRegionSelector,type Region} from './WebRegionSelector.tsx';
import {useWebPreview} from './use-web-preview.ts';
import {restoreWebDraft,targetAt,reviewInstruction} from './web-annotation.ts';
import type {WebFiles} from './web-files.ts';
import css,{mountStyles} from './WebReview.module.css';

export function WebReview({owner,read,onBack,onInsert}:{owner:Owner;read:WebFiles;onBack:()=>void;onInsert:(text:string,signal:AbortSignal)=>Promise<void>}){
 const key='dsh-web-review:v1:'+ownerKey(owner);
 const [draft,setDraft]=useState(()=>restoreWebDraft(key));
 const {page,busy,error,setError,read:load}=useWebPreview(owner,read,draft.path);
 const [marking,setMarking]=useState(false),[loaded,setLoaded]=useState(false);
 const frame=useRef<HTMLIFrameElement>(null);
 const [view,setView]=useState({width:0,height:0,x:0,y:0});
 const [storageError,setStorageError]=useState(false);
 useLayoutEffect(()=>mountStyles(),[]);
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{setStorageError(true);}},[draft,key]);
 useLayoutEffect(()=>{
  setLoaded(false);
  setMarking(false);
 },[page?.revision]);
 const open=()=>load(draft.path,next=>setDraft(old=>({...old,path:next.path})));
 const submit=()=>load(draft.path,(next,signal)=>onInsert(reviewInstruction(draft,next,frame.current),signal));
 useEffect(()=>{
  const win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!loaded||!win||!doc)return;
  const sync=()=>setView({width:win.innerWidth,height:win.innerHeight,x:win.scrollX,y:win.scrollY});
  const resize=new ResizeObserver(sync);resize.observe(frame.current!);win.addEventListener('scroll',sync);sync();
  return ()=>{resize.disconnect();win.removeEventListener('scroll',sync);};
 },[loaded,page]);
 const select=({x,y,w,h}:Region)=>{
  const win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!page||!win||!doc)return;
  if(w<4||h<4){setError('请按住并拖动，圈出想修改的部分');return;}
  const target=targetAt(doc,x+w/2,y+h/2);
  if(!target){setError('未找到目标，请重新圈选');return;}
  setDraft(old=>({...old,mark:{revision:page.revision,path:page.path,x:x+win.scrollX,y:y+win.scrollY,w,h,width:win.innerWidth,height:win.innerHeight,scrollX:win.scrollX,scrollY:win.scrollY,target}}));setError('');
 };
 const mark=draft.mark;
 const current=!!page&&!!mark&&mark.path===page.path&&mark.revision===page.revision&&mark.width===view.width&&mark.height===view.height;
 const saved=current?{x:mark.x-view.x,y:mark.y-view.y,w:mark.w,h:mark.h}:null;
 const guidance=storageError?'本标签页暂时无法保存批注草稿':mark&&!current?'网页或视口已变化，请重新圈选':mark?'圈选已保存，加入后由你确认发送':'选择「圈选区域」，在页面上拖动';
 return <section className={css.webReview} aria-label="网页批注">
  <header>
   <strong>网页批注</strong>
   <div className={css.webModes} role="group" aria-label="预览模式">
    <button type="button" aria-pressed={!marking} onClick={()=>setMarking(false)}>浏览</button>
    <button type="button" aria-pressed={marking} disabled={!loaded||busy} onClick={()=>setMarking(true)}>圈选区域</button>
   </div>
   <button className={css.back} onClick={onBack}>返回草图</button>
  </header>
  <form className={css.location} onSubmit={e=>{e.preventDefault();void open();}}>
   <input aria-label="工作区 HTML 路径" placeholder="工作区路径，例如 pages/home.html" value={draft.path} maxLength={512} disabled={busy} onChange={e=>setDraft({...draft,path:e.target.value})}/>
   <button disabled={busy}>{busy?'读取中…':page?.path===draft.path?'刷新网页':'打开网页'}</button>
  </form>
  <div className={css.webViewport}>{page&&<iframe key={page.revision} ref={frame} sandbox="allow-same-origin" referrerPolicy="no-referrer" title="网页排版预览" srcDoc={page.html} onLoad={()=>{setLoaded(true);if(mark?.revision===page.revision)frame.current?.contentWindow?.scrollTo(mark.scrollX,mark.scrollY);}}/>}
   {!page&&<div className={css.empty} role="status">{busy?'正在载入网页…':error||'输入工作区中的 HTML 路径以打开网页'}</div>}
   {marking&&<WebRegionSelector saved={saved} disabled={busy} onSelect={select}/>}
  </div>
  {page&&<footer>
   <label htmlFor="web-review-note">修改意见</label>
   <div className={css.composer}>
    <input id="web-review-note" value={draft.note} maxLength={1500} disabled={busy} onChange={e=>setDraft({...draft,note:e.target.value})} placeholder="例如：把圈出的搜索框移到右侧"/>
    <button className={css.primary} disabled={busy||!current||!draft.note.trim()||draft.path!==page?.path} onClick={()=>void submit()}>加入当前聊天</button>
   </div>
   <div className={css.statusRow}>
    <small role="status" data-error={!!error}>{error||guidance}</small>
    {page?.hasScript&&<small>静态预览 · 脚本未运行</small>}
   </div>
  </footer>}
 </section>;
}
