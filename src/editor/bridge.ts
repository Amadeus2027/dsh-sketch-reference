import {bridgeResult} from '../core/bridge.ts';
import type {Owner} from '../core/contracts.ts';
const params=new URLSearchParams(location.search),nonce=params.get('nonce'),sessionId=params.get('sessionId');
let port:MessagePort|undefined;
const waiting=new Map<string,{resolve:(text:string)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
export function startBridge():()=>void {
 const receive=(event:MessageEvent)=>{
  if(event.source!==window.parent || event.origin!==location.origin || event.data?.type!=='SKETCH_INIT' || event.data?.nonce!==nonce || event.data?.sessionId!==sessionId || !event.ports[0])return;
  port?.close();port=event.ports[0];
  port.onmessage=(event)=>{const p=bridgeResult.safeParse(event.data);if(!p.success)return;const task=waiting.get(p.data.id);if(!task)return;clearTimeout(task.timer);waiting.delete(p.data.id);if(p.data.ok)task.resolve(p.data.message);else task.reject(new Error(p.data.message));};port.start();
 };
 window.addEventListener('message',receive);
 const ready=()=>window.parent.postMessage({type:'SKETCH_READY',nonce,sessionId},location.origin);
 ready();const timer=setInterval(()=>{if(!port)ready();},500);
 return()=>{clearInterval(timer);window.removeEventListener('message',receive);port?.close();port=undefined;for(const task of waiting.values()){clearTimeout(task.timer);task.reject(new Error('画板已关闭'));}waiting.clear();};
}
function send(message:Record<string,unknown>,transfer:Transferable[]=[]):Promise<string> {
 if(!port)return Promise.reject(new Error('宿主连接未就绪，请从会话内打开参考板'));
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('宿主操作超时，请重试'));},30000);
  waiting.set(id,{resolve,reject,timer});port!.postMessage({...message,id},transfer);
 });
}
export async function stageImage(owner:Owner,blob:Blob,digest:string){const bytes=await blob.arrayBuffer();return send({type:'STAGE_IMAGE',owner,bytes,digest},[bytes]);}
export function insertAdvice(owner:Owner,batchId:string,index:number){return send({type:'INSERT_ADVICE',owner,batchId,index});}
export function closeBoard(){return send({type:'CLOSE'});}
