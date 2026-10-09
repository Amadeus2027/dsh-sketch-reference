// Isolated DSH browser fixture. Synthetic model responses; real native Agent/tool loop.
// Never load in a real profile. No credentials or model/network requests.
import {randomUUID} from 'node:crypto';
import {LlmAdapter} from '@deepseek-ai/dsh-llm';
export const inject=['llm','tools','sketchReference','webServer','connection'];
export function apply(ctx){
 const calls=[];const previous=ctx.llm.stream;
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/sketch-reference-test-agent-stats',handler:(req,res)=>{
  const rejection=ctx.connection.requestRejection(req);if(rejection){res.writeHead(rejection);res.end();return;}
  if(req.method==='POST'){ctx.get('sketchReference').events.close();res.writeHead(204);res.end();return;}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify({calls,registered:['sketch_read','sketch_annotate'].map(name=>!!ctx.tools.get(name)),eventClients:ctx.get('sketchReference').events.size}));
 }}));
 ctx.llm.stream=async function*(request){
  if(request.system?.startsWith('你是手绘参考板')){yield* previous.call(this,request);return;}
  if(request.purpose==='session-title'){yield* text('草图协作测试');return;}
  const index=request.messages.findLastIndex(m=>m.role==='user'&&m.content.some(c=>c.type==='text'&&c.text.includes('SKETCH_AGENT_TEST')));
  if(index<0)throw new Error('Real model calls disabled by native Agent test fixture');
  const task=request.messages[index].content.filter(c=>c.type==='text').map(c=>c.text).join('');
  const results=request.messages.slice(index+1).filter(m=>m.role==='tool').flatMap(m=>m.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text);}catch{return null;}})).filter(Boolean);
  const call={sessionId:request.sessionId,task,hasImage:request.messages[index].content.some(c=>c.type==='image'),step:results.length,aborted:false,tools:request.tools?.map(t=>t.name)??[]};calls.push(call);
  request.signal?.throwIfAborted();request.signal?.addEventListener('abort',()=>{call.aborted=true;},{once:true});
  if(task.includes('FAIL'))throw new Error('Synthetic native model failure');
  if(task.includes('CANCEL'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,60000);request.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(request.signal.reason);},{once:true});});
  const annotated=results.find(r=>r.batchId&&r.message?.includes('批注已保存'));
  if(annotated){yield* text('SKETCH_AGENT_DONE：模拟原生回答与批注已完成。');return;}
  const proposed=results.find(r=>r.proposalId);
  if(proposed){yield* text('SKETCH_EDIT_DONE：修改提议已保存，等待用户确认。');return;}
  const read=results.findLast(r=>r.hasDrawing);
  if(!read){yield* tool('sketch_read',{});return;}
  if(task.includes('PROPOSE')){
   if(read.elements.length&&!('x' in read.elements[0])){yield* tool('sketch_read',{mode:'elements',revision:read.revision});return;}
   const target=read.elements.find(e=>e.type==='rectangle');
   const operations=[{op:'move',elementId:target.id,x:target.x+50,y:target.y+40},{op:'resize',elementId:target.id,width:200,height:120},
    ...['rectangle','ellipse','diamond','text','arrow'].map((type,i)=>({op:'create',type,x:420+i*20,y:160+i*60,width:120,height:40,...(type==='text'?{text:'Agent 中文文字'}:{})})),
    ...(read.elements.some(e=>e.id==='edit-delete')?[{op:'delete',elementId:'edit-delete'}]:[])];
   yield* tool('sketch_propose_edit',{revision:read.revision,expectedProposalId:read.proposal?.id??null,summary:'模拟受限修改：移动、调整、新增与删除',operations});return;
  }
  if(task.includes('READ_ONLY')){yield* text(`SKETCH_AGENT_READ_DONE：当前已保存 ${read.totalElements} 个元素，未创建批注。`);return;}
  const target=read.elements.find(e=>e.type==='rectangle')??read.elements[0];
  yield* tool('sketch_annotate',{revision:read.revision,expectedBatchId:read.annotations?.batchId??null,summary:'模拟通用草图解释，仅验证原生工具链路',comments:[
   {title:'几何关系',reason:'这是测试批注，不代表模型的实际识别结果。',...(target?{anchor:{type:'element',elementId:target.id}}:{})},
   {title:'整体说明',reason:'不确定位置时使用全局说明。',anchor:{type:'element',elementId:'synthetic-unknown-id'}},
   {title:'同图补充',reason:'同一元素的多个批注应能分别点击。',...(target?{anchor:{type:'element',elementId:target.id}}:{})},
  ]});
 };
 const stream=ctx.llm.stream;
 class ScriptedAdapter extends LlmAdapter {
  async listModels(provider){return [{provider,id:'deepseek-flash',name:'Flash (scripted fixture)',inputModalities:['text','image']}];}
  async resolveModel(provider,model){return {provider,id:model,name:model,inputModalities:['text','image']};}
  stream(request){return stream(request);}
 }
 // Replaces disabled credential adapters only in this isolated test profile.
 ctx.llm.registerAdapter(['deepseek-official','deepseek-account'],new ScriptedAdapter());
 ctx.effect(()=>()=>{ctx.llm.stream=previous;});
}
function* tool(name,args){const id=randomUUID(),argumentsJson=JSON.stringify(args);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsJson};yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsJson}};yield {type:'finish',reason:{kind:'tool-calls'}};}
function* text(value){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:value};yield {type:'block-end',index:0,block:{type:'text',text:value}};yield {type:'finish',reason:{kind:'stop'}};}
