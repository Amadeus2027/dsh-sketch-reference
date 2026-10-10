import {useEffect,useRef,useMemo,useSyncExternalStore} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {ConversationSlotProps} from '@deepseek-ai/dsh-client-ui-conversation/client';
import {ASSETS,loadSchema,batchSchema,routeSchema,sameOwner} from '../core/contracts.ts';
import {bridgeMessage} from '../core/bridge.ts';
import {agentBatchSchema} from '../core/agent.ts';
import {withComments} from '../core/comments.ts';
import {commentContext} from '../core/comment-context.ts';
import {insertCommentText} from './comment-insertion.ts';
import {rpc} from '../editor/rpc.ts';
import {draftBridge} from './harness-draft-bridge.ts';
import type {Appearance} from '../core/appearance.ts';
import css from './SketchShell.module.css';
export function SketchFrame({ctx,props,onClose,appearance,subscribeClose}:{ctx:Context;props:Omit<ConversationSlotProps,'renderSlot'|'__renders'>;onClose:()=>void;appearance:Appearance;subscribeClose:(listener:(id:string)=>void)=>()=>void}) {
 const frame=useRef<HTMLIFrameElement>(null),latest=useRef(props);
 const connection=useRef<MessagePort|null>(null),announce=useRef<()=>void>(()=>{}),nativeAppearance=useRef(appearance);nativeAppearance.current=appearance;
 const initialTheme=useRef(appearance.theme);
 latest.current=props;
 const ids=props.useInput(s=>s?.attachmentIds??[]);
 interface ModelState {current:{provider:string;model:string}|null;status:string}
 interface ModelDirectories {directoryFor(id:NonNullable<typeof props.sessionId>):{store:{getSnapshot():ModelState;subscribe(callback:()=>void):()=>void}}}
 const modelSource=useMemo(()=>{
  const service=ctx.get('modelDirectories') as unknown as ModelDirectories;
  const store=service.directoryFor(props.sessionId!).store;
  return {get:()=>store.getSnapshot(),subscribe:(listener:()=>void)=>store.subscribe(listener)};
 },[ctx,props.sessionId]);
 const modelState=useSyncExternalStore(modelSource.subscribe,modelSource.get);
 const selection=modelState.status==='selecting'?null:modelState.current;
 const live=useRef({selection,ids,onClose});live.current={selection,ids,onClose};
 const nonce=useMemo(()=>crypto.randomUUID(),[props.sessionId]);
 useEffect(()=>{connection.current?.postMessage({type:'APPEARANCE',value:appearance});},[appearance]);
 useEffect(()=>{
  const abort=new AbortController();let port:MessagePort|undefined,documentId:string|undefined,closePending=false,bridgeAbort=new AbortController();
  const staged=new Map<string,string>();
  announce.current=()=>frame.current?.contentWindow?.postMessage({type:'SKETCH_CONNECT',nonce,sessionId:props.sessionId},location.origin);
  const unsubscribeClose=subscribeClose(id=>{if(id!==props.sessionId)return;if(port)port.postMessage({type:'REQUEST_CLOSE'});else{closePending=true;announce.current();}});
  const onMessage=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow || event.origin!==location.origin)return;
   const ready=event.data as {type?:string;nonce?:string;sessionId?:string;instanceId?:string};
   if(ready.type!=='SKETCH_READY' || ready.nonce!==nonce || ready.sessionId!==props.sessionId||!ready.instanceId)return;
   if(port&&documentId===ready.instanceId)return;
   bridgeAbort.abort();bridgeAbort=new AbortController();const signal=AbortSignal.any([abort.signal,bridgeAbort.signal]);documentId=ready.instanceId;
   port?.close();const channel=new MessageChannel();port=channel.port1;connection.current=port;const replyPort=port;let processing=false;
   replyPort.onmessage=(event)=>{
    const parsed=bridgeMessage.safeParse(event.data);if(!parsed.success)return;
    const message=parsed.data;
    const reply=(ok:boolean,messageText:string)=>{if(!signal.aborted&&replyPort===port)replyPort.postMessage({type:'RESULT',id:message.id,ok,message:messageText});};
    if(message.type==='CLOSE'){reply(true,'已关闭');live.current.onClose();return;}
    if(processing){reply(false,'正在处理上一次操作，请稍后重试');return;}
    processing=true;
    void(async()=>{
     if(!props.sessionId || latest.current.sessionId!==props.sessionId || signal.aborted)throw new Error('会话已变化');
     const agentState=message.type==='INSERT_COMMENT'&&message.request.source==='agent'?await rpc('agent/get',message.owner,null,signal) as {batch:unknown}:null;
     const loaded=loadSchema.parse(await rpc('drawing/get',message.owner,{sessionId:props.sessionId},signal));
     if(!sameOwner(loaded.owner,message.owner))throw new Error('会话已变化');
     const actions=latest.current.inputActions;
     if(!actions)throw new Error('输入框尚未就绪');
     if(message.type==='INSERT_COMMENT'){
      const batch=message.request.source==='agent'?agentBatchSchema.nullable().parse(agentState?.batch):loaded.latestAdvice?withComments(loaded.latestAdvice):null;
      const text=await commentContext(loaded.drawing,batch,message.request);
      insertCommentText(actions,text,()=>latest.current.sessionId===props.sessionId&&!signal.aborted);
      reply(true,'批注已加入原生输入框，请补充内容并手动发送');return;
     }
     if(message.type==='INSERT_ADVICE'){
      const batch=batchSchema.parse(loaded.latestAdvice);
      if(batch.id!==message.batchId || batch.contentDigest!==loaded.drawing?.contentDigest || batch.goal!==loaded.drawing?.goal)throw new Error('建议基于较早草图，请重新获取');
      const suggestion=batch.advice.suggestions[message.index];if(!suggestion)throw new Error('建议不存在');
      if(batch.comments?.some(c=>c.suggestionIndex===message.index&&c.status==='ignored'))throw new Error('批注已被忽略，请刷新批注');
      const span=actions.captureInsertion();
      if(latest.current.sessionId!==props.sessionId || signal.aborted || !actions.insertText(suggestion.actionPrompt,span))throw new Error('输入框已变化，请再次点击');
      actions.persistDraft();reply(true,'建议已加入输入框；请再加入参考图');return;
     }
     if(loaded.drawing?.sceneDigest!==message.digest)throw new Error('草图已变化，请重新加入参考图');
     const chosen=live.current.selection;
     const route=routeSchema.safeParse(chosen&&{provider:chosen.provider,model:chosen.model});
     if(!route.success)throw new Error('请先在左侧选择支持图片的官方 DeepSeek Flash 模型');
     const existing=staged.get(message.digest);
     if(existing && (live.current.ids??[]).some(id=>id===existing)){reply(true,'这张参考图已经在输入框中');return;}
     await rpc('model/check',message.owner,route.data,signal);
     if(latest.current.sessionId!==props.sessionId || signal.aborted || live.current.selection?.provider!==chosen?.provider || live.current.selection?.model!==chosen?.model)throw new Error('会话或模型已变化');
     const bridge=draftBridge(ctx);
     if(!bridge)throw new Error('当前宿主未提供附件注册，请先下载 PNG 手工加入');
     const id=bridge.stage(props.sessionId,message.bytes,actions,()=>!signal.aborted && latest.current.sessionId===props.sessionId);
     staged.set(message.digest,id);reply(true,'参考图已加入左侧输入框，请使用原有发送按钮');
    })().catch(error=>reply(false,error instanceof Error?error.message:'操作失败')).finally(()=>{processing=false;});
   };
   port.start();
   frame.current?.contentWindow?.postMessage({type:'SKETCH_INIT',nonce,sessionId:props.sessionId},location.origin,[channel.port2]);
   replyPort.postMessage({type:'APPEARANCE',value:nativeAppearance.current});
   if(closePending){closePending=false;replyPort.postMessage({type:'REQUEST_CLOSE'});}
  };
  window.addEventListener('message',onMessage);
  announce.current();
  return()=>{abort.abort();bridgeAbort.abort();port?.close();connection.current=null;announce.current=()=>{};unsubscribeClose();window.removeEventListener('message',onMessage);};
 },[ctx,nonce,props.sessionId,subscribeClose]);
 return <iframe ref={frame} className={css.frame} title="手绘参考板" onLoad={()=>announce.current()} src={`${ASSETS}/index.html?sessionId=${encodeURIComponent(props.sessionId??'')}&nonce=${nonce}&theme=${initialTheme.current}`} />;
}
