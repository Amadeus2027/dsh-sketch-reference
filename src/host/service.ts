import {ADVICE_TIMEOUT,IMAGE_LIMITS} from '../core/limits.ts';
import { randomUUID } from 'node:crypto';
import { Context,Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { z as schema } from 'zod';
import { defineDomain,domainTable } from '@deepseek-ai/dsh-storage-domain';
import { SessionId,type SessionHeader } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import { ASSETS,RPC,MAX_PNG,SketchError,drawingSchema,batchSchema,saveSchema,generateSchema,routeSchema,commentUpdateSchema,ownerKey,sameOwner,type Owner,type Drawing,type Batch,type Route,envelopeSchema } from '../core/contracts.ts';
import { Repository } from './repository.ts';
import {CommentRepository} from './comment-repository.ts';
import { handler } from './http.ts';
import { checkRoute,generateAdvice } from './advice.ts';
import { createEditorAssetsHandler } from './static.ts';
import {agentBatchSchema,AGENT_EVENTS,type AgentBatch} from '../core/agent.ts';
import {SketchAgent} from './agent.ts';
import {createSketchTools} from './tools.ts';
import {AgentEvents} from './agent-events.ts';
import {proposalSchema,proposalActionSchema,applyEditSchema,type EditProposal} from '../core/edits.ts';
import {EditRepository} from './edit-repository.ts';
import {VisualRepository} from './visual-repository.ts';
import {visualRecordSchema,visualPrepareSchema,type VisualRecord} from '../core/visual.ts';
import type {} from '@deepseek-ai/dsh-tools';
export interface Config { adviceDeadlineMs:number }
export const Config:z<Config> = z.object({adviceDeadlineMs:z.number().min(ADVICE_TIMEOUT.minMs).max(ADVICE_TIMEOUT.maxMs).default(ADVICE_TIMEOUT.defaultMs)});
interface Sessions {get(id:SessionId):{header:SessionHeader}|undefined}
const domainSpec=defineDomain({name:'sketch_reference',version:0,tables:{drawings:domainTable<string,Drawing>(drawingSchema),advice:domainTable<string,Batch>(batchSchema)}});
// Separate additive domain: old authoritative drafts and advice keep their exact format.
const agentDomainSpec=defineDomain({name:'sketch_agent',version:0,tables:{annotations:domainTable<string,AgentBatch>(agentBatchSchema)}});
const editDomainSpec=defineDomain({name:'sketch_edits',version:0,tables:{proposals:domainTable<string,EditProposal>(proposalSchema)}});
const visualDomainSpec=defineDomain({name:'sketch_visual',version:0,tables:{references:domainTable<string,VisualRecord>(visualRecordSchema)}});
export class SketchService extends Service {
 static inject=['storageDomain','sessionPersistence','sessions','webServer','connection','llm','attachments'];
 static Config=Config;
 private repository!:Repository;
 private advice!:CommentRepository;
 private sessions!:Sessions;
 private lifetime=new AbortController();
 private busy=new Set<string>();
 private times=new Map<string,number[]>();
 private tasks=new Set<Promise<unknown>>();
 private agent:SketchAgent|undefined;
 private edits:EditRepository|undefined;
 private visual:VisualRepository|undefined;
 private events=new AgentEvents();
 private track=<T>(task:Promise<T>):Promise<T>=>{this.tasks.add(task);void task.finally(()=>this.tasks.delete(task)).catch(()=>{});return task;};
 constructor(ctx:Context,private config:Config,private root:string){super(ctx,'sketchReference');}
 protected async [Service.init]() {
  if(this.ctx.webServer.host!=='127.0.0.1')throw new Error('手绘参考板首版要求 Harness 绑定 127.0.0.1');
  this.sessions=this.ctx.get('sessions') as Sessions;
  const domain=await this.ctx.storageDomain.open(domainSpec);
  this.repository=new Repository(domain.table('drawings'));
  this.advice=new CommentRepository(domain.table('advice'));
  this.ctx.effect(()=>async()=>{
   this.lifetime.abort();this.events.close();await Promise.allSettled([...this.tasks]);await this.repository.drain();await this.advice.drain();await domain.close();
  });
  this.ctx.effect(()=>this.ctx.webServer.register({kind:'prefix',path:ASSETS,handler:(req,res)=>{const rejection=this.ctx.connection.requestRejection(req);if(rejection){res.writeHead(rejection);res.end('unauthorized');return;}return createEditorAssetsHandler(this.root)(req,res);}}));
  this.ctx.effect(()=>this.ctx.webServer.register({kind:'prefix',path:RPC,handler:(req,res)=>{const rejection=this.ctx.connection.requestRejection(req);if(rejection){res.writeHead(rejection);res.end('unauthorized');return;}return handler((method,body,signal)=>{
   const task=this.operation(method,body,AbortSignal.any([signal,this.lifetime.signal]));
   this.tasks.add(task);void task.finally(()=>this.tasks.delete(task)).catch(()=>{});return task;
  },error=>this.ctx.logger.error(error))(req,res);}}));
  this.ctx.effect(()=>this.ctx.webServer.register({kind:'exact',path:AGENT_EVENTS,handler:(req,res)=>{
   const rejection=this.ctx.connection.requestRejection(req);if(rejection){res.writeHead(rejection);res.end('unauthorized');return;}
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const abort=new AbortController(),closed=()=>abort.abort();res.on('close',closed);
   const signal=AbortSignal.any([abort.signal,this.lifetime.signal]);
   return this.track((async()=>{
    const params=new URL(req.url??'', 'http://127.0.0.1').searchParams;
    const owner=schema.object({sessionId:schema.string().min(1).max(200),createdAt:schema.string().min(1).max(100),cwd:schema.string().max(4096)}).strict().parse(Object.fromEntries(params));
    if(!this.agent)throw new SketchError('AGENT_UNAVAILABLE','Agent 工具暂不可用',503);
    if(!sameOwner(owner,await this.resolve(owner.sessionId,signal)))throw new SketchError('SESSION_CHANGED','会话已变化',409);
    signal.throwIfAborted();this.events.connect(owner,res);
   })().catch(error=>{if(!res.headersSent){res.writeHead(error instanceof SketchError?error.status:400);res.end('annotation stream unavailable');}}));
  }}));
  this.ctx.inject(['tools'],async toolCtx=>{
   const abort=new AbortController();
   const unregister:Array<()=>void>=[];
   let disposeAgent:(()=>Promise<void>)|undefined;
   try{
    const domain=await toolCtx.storageDomain.open(agentDomainSpec);
    const editDomain=await toolCtx.storageDomain.open(editDomainSpec).catch(error=>{toolCtx.logger.warn('修改提议存储暂不可用，读取与批注保留：%s',error instanceof Error?error.message:'unknown');return undefined;});
    const edits=editDomain?new EditRepository(editDomain.table('proposals'),this.repository):undefined;
    const visualDomain=await toolCtx.storageDomain.open(visualDomainSpec).catch(()=>undefined);
    const visual=visualDomain?new VisualRepository(visualDomain.table('references'),toolCtx.attachments):undefined;
    const agent=new SketchAgent({
     snapshot:async(session,signal)=>{
      const owner={sessionId:String(session.id),createdAt:String(session.createdAt),cwd:session.cwd??''};
      await this.checkAgent(owner,null,signal);return {owner,drawing:this.repository.get(owner)};
     },check:(owner,revision,signal)=>this.checkAgent(owner,revision,signal),changed:owner=>this.events.changed(owner),analysis:owner=>this.advice.get(owner),
    },new CommentRepository(domain.table('annotations')),edits,visual);
    let closing:Promise<void>|undefined;
    disposeAgent=()=>closing??= (async()=>{abort.abort();if(this.agent===agent){this.agent=undefined;this.edits=undefined;this.visual=undefined;}this.events.close();await agent.drain();await edits?.drain();await visual?.drain();agent.clear();await visualDomain?.close();await editDomain?.close();await domain.close();})();
    toolCtx.effect(()=>disposeAgent!);
    this.lifetime.signal.throwIfAborted();
    for(const tool of createSketchTools(agent,AbortSignal.any([abort.signal,this.lifetime.signal]),this.track,async(exec,signal)=>{
     const routed=exec.agent?.session.requestHeader()?.config,provider=routed?.provider??exec.agent?.options.provider,model=routed?.model??exec.agent?.options.model;
     if(!provider||!model)throw new SketchError('VISION_UNAVAILABLE','当前模型路线不可确定，请在 DSH 配置支持图片的模型',422);
     const info=await toolCtx.llm.resolveModelInfo(provider,model,signal);
     if(!info.inputModalities?.includes('image'))throw new SketchError('VISION_UNAVAILABLE','当前模型不支持图片；结构读取与绘图仍可用',422);
    }))unregister.push(toolCtx.tools.register(tool));
    this.agent=agent;
    this.edits=edits;
    this.visual=visual;
   }catch(error){abort.abort();for(const dispose of unregister.reverse())dispose();await disposeAgent?.();toolCtx.logger.warn('Agent 协作初始化失败，基础画板保留：%s',error instanceof Error?error.message:'unknown');}
  });
 }
 private async checkAgent(owner:Owner,revision:string|null,signal:AbortSignal){
  signal.throwIfAborted();if(!sameOwner(owner,await this.resolve(owner.sessionId,signal)))throw new SketchError('SESSION_CHANGED','会话已变化',409);
  if(revision!==null&&this.repository.get(owner)?.revision!==revision)throw new SketchError('REVISION_CONFLICT','草图已变化，请重新读取',409);
 }
 private async resolve(id:string,signal:AbortSignal):Promise<Owner> {
  signal.throwIfAborted();
  const header=this.sessions.get(SessionId(id))?.header;
  const saved=await this.ctx.sessionPersistence.stat(SessionId(id),{signal});
  const live=this.sessions.get(SessionId(id))?.header;
  const result=live??saved?.header;
  if(!result || (header && !live && header.createdAt!==result.createdAt))throw new SketchError('SESSION_CHANGED','会话不存在或已变化',404);
  return {sessionId:String(result.id),createdAt:String(result.createdAt),cwd:result.cwd??''};
 }
 private async routes():Promise<Route[]> {
  const providers=this.ctx.llm.listProviders().map(p=>p.id);
  const routes:Route[]=[];
  for(const provider of ['deepseek-account','deepseek-official'] as const){
   if(!providers.includes(provider))continue;
   try{const models=await this.ctx.llm.listModels(provider);if(models.some(m=>m.id==='deepseek-flash'))routes.push({provider,model:'deepseek-flash'});}
   catch(error){this.ctx.logger.warn('手绘参考板：官方 DS 路线暂不可用：%s',provider);}
  }
  return routes;
 }
 private async operation(method:string,body:ReturnType<typeof envelopeSchema.parse>,signal:AbortSignal):Promise<unknown> {
  if(method==='drawing/get'){
   const payload=schema.object({sessionId:schema.string().min(1).max(200)}).strict().parse(body.payload);
   const owner=await this.resolve(payload.sessionId,signal);
   if(body.owner && !sameOwner(owner,body.owner))throw new SketchError('SESSION_CHANGED','会话已变化',409);
   return {owner,drawing:this.repository.get(owner),latestAdvice:this.advice.get(owner),routes:await this.routes()};
  }
  if(!body.owner)throw new SketchError('OWNER_REQUIRED','缺少会话信息');
  const owner=body.owner;
  const check=async()=>{signal.throwIfAborted();if(!sameOwner(owner,await this.resolve(owner.sessionId,signal)))throw new SketchError('SESSION_CHANGED','会话已变化',409);};
  await check();
  if(method==='agent/get')return {available:!!this.agent,batch:this.agent?.comments.get(owner)??null};
  if(method==='visual/get'){const drawing=this.repository.get(owner),focus=this.agent?.getFocus(owner)??null;return this.visual?.status(owner,drawing,focus)??{available:false,all:null,focus:null,selection:focus?{...focus,stale:focus.revision!==drawing?.revision}:null};}
  if(method==='visual/prepare'){
   const visual=this.visual,agent=this.agent;
   if(!visual||!agent)throw new SketchError('VISUAL_UNAVAILABLE','视觉参考暂不可用，仍可使用原生附件',503);
   const input=visualPrepareSchema.parse(body.payload),drawing=this.repository.get(owner);
   if(!drawing||drawing.revision!==input.revision)throw new SketchError('REVISION_CONFLICT','草图已变化，请重新准备视觉参考',409);
   const focus=agent.getFocus(owner),png=validatePng(input.pngBase64);
   if(!drawing.scene.elements.some(e=>!e.isDeleted))throw new SketchError('EMPTY_SCENE','先画一点内容');
   const current=async()=>{await this.checkAgent(owner,drawing.revision,signal);if(this.visual!==visual||this.agent!==agent)throw new SketchError('VISUAL_UNAVAILABLE','视觉参考服务已变化，请重试',503);if(input.scope==='focus'&&JSON.stringify(agent.getFocus(owner))!==JSON.stringify(focus))throw new SketchError('FOCUS_STALE','选区重点已变化，请重新准备',409);};
   await visual.prepare(owner,drawing,input.scope,focus,png,current);await current();return visual.status(owner,drawing,agent.getFocus(owner));
  }
  if(method==='agent/focus'){
   if(!this.agent)throw new SketchError('AGENT_UNAVAILABLE','Agent 工具暂不可用',503);
   await check();return this.agent.setFocus(owner,body.payload,this.repository.get(owner));
  }
  if(method==='proposal/get')return this.edits?.read(owner,body.payload)??{available:false,unchanged:false,proposal:null};
  if(method==='proposal/dismiss'||method==='proposal/apply'){
   if(!this.edits)throw new SketchError('AGENT_UNAVAILABLE','修改提议暂不可用，基础画板保留',503);
   const result=method==='proposal/dismiss'?await this.edits.dismiss(owner,proposalActionSchema.parse(body.payload).proposalId,check):await (async()=>{const input=applyEditSchema.parse(body.payload);return this.edits!.apply(owner,input.proposalId,input.scene,check);})();
   this.events.changed(owner);return result;
  }
  if(method==='agent/metrics')return {measurements:this.agent?.measurements??[],inputTokens:null,scope:'plugin tools only; not model or total Agent latency'};
  if(method==='agent/update'){
   if(!this.agent)throw new SketchError('AGENT_UNAVAILABLE','Agent 工具暂不可用，基础画板保留',503);
   const result=await this.agent.comments.update(owner,commentUpdateSchema.parse(body.payload),check);this.events.changed(owner);return result;
  }
  if(method==='drawing/save') return this.repository.save(owner,saveSchema.parse(body.payload),check);
  if(method==='advice/get')return this.advice.get(owner);
  if(method==='advice/update')return this.advice.update(owner,commentUpdateSchema.parse(body.payload),check);
  if(method==='model/check'){await checkRoute(this.ctx,routeSchema.parse(body.payload),signal);return {imageCapable:true};}
  if(method==='advice/generate'){
   const input=generateSchema.parse(body.payload), key=ownerKey(owner);
   const drawing=this.repository.get(owner);
   if(!drawing || drawing.revision!==input.revision)throw new SketchError('REVISION_CONFLICT','草图已变化，请重新获取建议',409);
   if(!drawing.scene.elements.some(e=>!e.isDeleted))throw new SketchError('EMPTY_SCENE','先画一点内容');
   const png=input.inputMode==='structure'?new Uint8Array():validatePng(input.pngBase64);
   if(this.busy.has(key))throw new SketchError('MODEL_BUSY','当前草图已有分析任务',409);
   if(this.busy.size>=2)throw new SketchError('MODEL_BUSY','分析任务较多，请稍后重试',429);
   const recent=(this.times.get(key)??[]).filter(t=>Date.now()-t<60000);
   if(recent.length>=6)throw new SketchError('RATE_LIMIT','请求频繁，请稍后重试',429);
   this.times.set(key,[...recent,Date.now()]);this.busy.add(key);
   if(this.times.size>500) for(const [k,v] of this.times){if(v.every(t=>Date.now()-t>60000))this.times.delete(k);}
   const combined=AbortSignal.any([signal,AbortSignal.timeout(this.config.adviceDeadlineMs)]);
   try {
    const advice=await generateAdvice(this.ctx,input.route,png,drawing.goal,combined,drawing.scene,input.inputMode);
    await check();combined.throwIfAborted();
    const current=async()=>{
     await check();combined.throwIfAborted();
     if(this.repository.get(owner)?.revision!==drawing.revision)throw new SketchError('REVISION_CONFLICT','分析期间草图已修改，请重新分析',409);
    };
    const batch:Batch={id:randomUUID(),owner,analysisRevision:drawing.revision,inputMode:input.inputMode,contentDigest:drawing.contentDigest,goal:drawing.goal,route:input.route,advice,createdAt:new Date().toISOString()};
    return await this.advice.put(batch,current);
   }catch(error){
    // Chromium can transparently retry POST responses with 408. Upstream model
    // timeouts use 504 so one explicit analysis cannot trigger a second stream.
    if(combined.aborted)throw new SketchError(signal.aborted?'MODEL_CANCELLED':'MODEL_TIMEOUT',signal.aborted?'分析已取消，草图保留':'DS 分析超时，草图保留，请稍后重试',signal.aborted?408:504);
    throw error;
   }finally{this.busy.delete(key);}
  }
  throw new SketchError('NOT_FOUND','接口不存在',404);
 }
}
export function validatePng(base64:string):Uint8Array {
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new SketchError('INVALID_PNG','图片编码无效');
 const png=Buffer.from(base64,'base64');
 if(png.length>MAX_PNG)throw new SketchError('PNG_LIMIT','图片超过 2MiB，请简化草图',413);
 if(png.length<33 || !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.toString('ascii',12,16)!=='IHDR')throw new SketchError('INVALID_PNG','图片格式无效');
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(!width || !height || width>IMAGE_LIMITS.maxDimension || height>IMAGE_LIMITS.maxDimension)throw new SketchError('PNG_LIMIT','图片尺寸无效');
 return png;
}
