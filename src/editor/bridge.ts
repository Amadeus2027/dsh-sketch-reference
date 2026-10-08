import {bridgeResult} from '../core/bridge.ts';
import type {Owner} from '../core/contracts.ts';
import {appearanceSchema} from '../core/appearance.ts';
import {applyAppearance} from './appearance.ts';
const params=new URLSearchParams(location.search),nonce=params.get('nonce'),sessionId=params.get('sessionId');
let port:MessagePort|undefined;
const waiting=new Map<string,{resolve:(text:string)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
export function startBridge(onRequestClose:()=>void=()=>{void closeBoard();}):()=>void {
 const instanceId=crypto.randomUUID();
 const ready=()=>window.parent.postMessage({type:'SKETCH_READY',nonce,sessionId,instanceId},location.origin);
 const receive=(event:MessageEvent)=>{
  if(event.source!==window.parent || event.origin!==location.origin || event.data?.nonce!==nonce || event.data?.sessionId!==sessionId)return;
  if(event.data.type==='SKETCH_CONNECT'){ready();return;}
  if(event.data.type!=='SKETCH_INIT'||!event.ports[0])return;
  port?.close();for(const task of waiting.values()){clearTimeout(task.timer);task.reject(new Error('宿主连接已重建，请重试'));}waiting.clear();port=event.ports[0];
  port.onmessage=(event)=>{
   if(event.data?.type==='REQUEST_CLOSE'){onRequestClose();return;}
   if(event.data?.type==='APPEARANCE'){const value=appearanceSchema.safeParse(event.data.value);if(value.success)applyAppearance(value.data);return;}
   const p=bridgeResult.safeParse(event.data);if(!p.success)return;const task=waiting.get(p.data.id);if(!task)return;clearTimeout(task.timer);waiting.delete(p.data.id);if(p.data.ok)task.resolve(p.data.message);else task.reject(new Error(p.data.message));
  };port.start();
 };
 window.addEventListener('message',receive);
 ready();
 return()=>{window.removeEventListener('message',receive);port?.close();port=undefined;for(const task of waiting.values()){clearTimeout(task.timer);task.reject(new Error('画板已关闭'));}waiting.clear();};
}
function send(message:Record<string,unknown>,transfer:Transferable[]=[]):Promise<string> {
 if(!port)return Promise.reject(new Error('宿主连接未就绪，请从会话内打开参考板'));
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('宿主操作超时，请重试'));},30000);
  waiting.set(id,{resolve,reject,timer});try{port!.postMessage({...message,id},transfer);}catch(error){clearTimeout(timer);waiting.delete(id);reject(error instanceof Error?error:new Error('宿主连接已断开'));}
 });
}
export async function stageImage(owner:Owner,blob:Blob,digest:string){const bytes=await blob.arrayBuffer();return send({type:'STAGE_IMAGE',owner,bytes,digest},[bytes]);}
export function insertAdvice(owner:Owner,batchId:string,index:number){return send({type:'INSERT_ADVICE',owner,batchId,index});}
export function closeBoard(){return send({type:'CLOSE'});}
