import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {SketchService} from '../src/host/service.ts';
import {batchSchema,contentDigest,type Drawing,type Owner} from '../src/core/contracts.ts';
const owner:Owner={sessionId:'session',createdAt:'123',cwd:'/workspace'};
const scene={elements:[{id:'rect',type:'rectangle' as const,x:0,y:0,width:100,height:40}],appState:{viewBackgroundColor:'#ffffff'},files:{}};
const advice={summary:'布局',suggestions:[{kind:'improve',title:'留白',reason:'提升可读性',actionPrompt:'根据所附手绘参考图增加留白。',anchor:{type:'element',elementId:'rect'}}]};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
async function setup(mode:'normal'|'changed'|'unavailable'|'waiting'='normal'){
 const drawing:Drawing={formatVersion:1,owner,revision:randomUUID(),mutationId:randomUUID(),sceneDigest:'full',contentDigest:await contentDigest(scene),scene,goal:'首页',updatedAt:new Date().toISOString()};
 let current=drawing,stored:unknown=null,calls=0;
 const carrier={repository:{get:()=>current},advice:{put:async(batch:unknown,check:()=>Promise<void>)=>{await check();stored=batch;return batch;}},busy:new Set<string>(),times:new Map<string,number[]>(),config:{adviceDeadlineMs:30},resolve:async()=>owner,ctx:{attachments:{saveImage:async()=>({attachmentId:'native-image',mediaType:'image/png' as const,bytes:68,width:1,height:1})},llm:{resolveModelInfo:async()=>{if(mode==='unavailable')throw new Error('Model unavailable');return {inputModalities:['image']};},stream:async function*(request:{signal:AbortSignal}){
  calls++;
  if(mode==='changed')current={...drawing,revision:randomUUID()};
  if(mode==='waiting')await new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true}));
  yield {type:'text-delta',index:0,text:JSON.stringify(advice)};yield {type:'finish',reason:{kind:'stop'}};
 }}}};
 // Exercise the actual RPC admission path with isolated host dependencies.
 const method=(SketchService.prototype as unknown as {operation:(method:string,body:unknown,signal:AbortSignal)=>Promise<unknown>}).operation;
 const call=(signal=new AbortController().signal,inputMode='hybrid',pngBase64=png)=>method.call(carrier,'advice/generate',{protocolVersion:1,requestId:randomUUID(),owner,payload:{revision:drawing.revision,pngBase64,route:{provider:'deepseek-account',model:'deepseek-flash'},inputMode}},signal);
 return {drawing,carrier,call,read:()=>({current,stored,calls})};
}
it('binds the result to the saved analysis revision and defaults to hybrid input',async()=>{
 const s=await setup();await expect(s.call()).resolves.toMatchObject({analysisRevision:s.drawing.revision,contentDigest:s.drawing.contentDigest,inputMode:'hybrid'});expect(s.read().calls).toBe(1);
});
it('accepts structure analysis without a PNG while rejecting an empty PNG in image mode',async()=>{
 const s=await setup();s.carrier.ctx.llm.resolveModelInfo=async()=>({inputModalities:['text']});
 s.carrier.ctx.attachments.saveImage=async()=>{throw new Error('structure mode must not register images');};
 await expect(s.call(undefined,'structure','')).resolves.toMatchObject({inputMode:'structure'});
 await expect(s.call(undefined,'image','')).rejects.toMatchObject({code:'INVALID_PNG'});
 expect(s.read().calls).toBe(1);
});
it('rejects a result when the saved scene changes during generation',async()=>{
 const s=await setup('changed');await expect(s.call()).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(s.read().stored).toBeNull();expect(s.read().current.scene).toEqual(scene);expect(s.carrier.busy.size).toBe(0);
});
it('keeps drafts and previous advice untouched when the model is unavailable',async()=>{
 const s=await setup('unavailable');await expect(s.call()).rejects.toThrow('Model unavailable');expect(s.read().current).toEqual(s.drawing);expect(s.read().stored).toBeNull();expect(s.carrier.busy.size).toBe(0);
});
it('reports a deadline without manufacturing advice or changing the drawing',async()=>{
 const s=await setup('waiting');await expect(s.call()).rejects.toMatchObject({code:'MODEL_TIMEOUT',status:504});expect(s.read().current).toEqual(s.drawing);expect(s.read().stored).toBeNull();expect(s.carrier.busy.size).toBe(0);
});
it('reports cancellation and releases request admission',async()=>{
 const s=await setup('waiting'),abort=new AbortController(),task=s.call(abort.signal);setTimeout(()=>abort.abort(),10);
 await expect(task).rejects.toMatchObject({code:'MODEL_CANCELLED'});expect(s.read().stored).toBeNull();expect(s.read().current).toEqual(s.drawing);expect(s.carrier.busy.size).toBe(0);
});
it('retains session and global concurrency admission and the existing rate cap',async()=>{
 const s=await setup();s.carrier.busy.add(JSON.stringify([owner.sessionId,owner.createdAt,owner.cwd]));await expect(s.call()).rejects.toMatchObject({code:'MODEL_BUSY'});s.carrier.busy.clear();
 s.carrier.busy.add('a');s.carrier.busy.add('b');await expect(s.call()).rejects.toMatchObject({code:'MODEL_BUSY'});s.carrier.busy.clear();
 s.carrier.times.set(JSON.stringify([owner.sessionId,owner.createdAt,owner.cwd]),Array(6).fill(Date.now()));await expect(s.call()).rejects.toMatchObject({code:'RATE_LIMIT'});expect(s.read().calls).toBe(0);expect(s.read().current).toEqual(s.drawing);
});
it('does not analyze a scene containing only deleted elements',async()=>{
 const s=await setup();s.carrier.repository.get=()=>({...s.drawing,scene:{...scene,elements:scene.elements.map(e=>({...e,isDeleted:true}))}});
 await expect(s.call()).rejects.toMatchObject({code:'EMPTY_SCENE'});expect(s.read().calls).toBe(0);expect(s.read().stored).toBeNull();
});
it('records native image metadata only on successful image analysis and keeps old batches readable',async()=>{
 const s=await setup(),batch=batchSchema.parse(await s.call());
 expect(batch.analysisImage).toEqual({attachmentId:'native-image',mediaType:'image/png',bytes:68,width:1,height:1});
 const {analysisImage,...legacy}=batch;expect(batchSchema.parse(legacy).analysisImage).toBeUndefined();
 const structure=batchSchema.parse(await s.call(undefined,'structure',''));expect(structure.analysisImage).toBeUndefined();
 expect(s.read().current).toEqual(s.drawing);
});
it('rejects an ignored image payload in structure mode before any model or attachment work',async()=>{
 const s=await setup();s.carrier.ctx.attachments.saveImage=async()=>{throw Error('must not save');};
 await expect(s.call(undefined,'structure',png)).rejects.toThrow();expect(s.read().calls).toBe(0);expect(s.carrier.busy.size).toBe(0);
});
it.each(['waiting','unavailable'] as const)('permits explicit retry after %s without automatic retry or losing old advice',async mode=>{
 const s=await setup(mode);
 await expect(s.call()).rejects.toThrow();expect(s.read().stored).toBeNull();expect(s.carrier.busy.size).toBe(0);expect(s.read().calls).toBe(mode==='waiting'?1:0);
 s.carrier.ctx.llm.resolveModelInfo=async()=>({inputModalities:['image']});s.carrier.ctx.llm.stream=async function*(){yield {type:'text-delta',index:0,text:JSON.stringify(advice)};yield {type:'finish',reason:{kind:'stop'}};};
 await expect(s.call()).resolves.toMatchObject({analysisRevision:s.drawing.revision});expect(s.read().current).toEqual(s.drawing);
});
it('leaves a previously committed batch intact on malformed output and recovers on explicit retry',async()=>{
 const s=await setup();await s.call();const previous=s.read().stored;
 s.carrier.ctx.llm.stream=async function*(){yield {type:'text-delta',index:0,text:'{broken'};yield {type:'finish',reason:{kind:'stop'}};};
 await expect(s.call()).rejects.toMatchObject({code:'MODEL_OUTPUT_INVALID'});expect(s.read().stored).toBe(previous);expect(s.carrier.busy.size).toBe(0);
 s.carrier.ctx.llm.stream=async function*(){yield {type:'text-delta',index:0,text:JSON.stringify(advice)};yield {type:'finish',reason:{kind:'stop'}};};
 await s.call();expect(s.read().stored).not.toBe(previous);expect(s.read().current).toEqual(s.drawing);
});
