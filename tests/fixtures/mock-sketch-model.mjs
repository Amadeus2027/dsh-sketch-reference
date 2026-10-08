// Isolated browser-test fixture only. Never install this patch in a real profile.
// It replaces the host stream in memory; it performs no network/model requests.
export const inject=['llm','sketchReference','webServer','connection'];
export function apply(ctx){
 console.log('MOCK_SKETCH_MODEL_DEADLINE_MS',ctx.get('sketchReference').config.adviceDeadlineMs);
 const calls=[];
 ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:'/sketch-reference-test-model-stats',handler:(req,res)=>{
  const rejected=ctx.connection.requestRejection(req);if(rejected){res.writeHead(rejected);res.end();return;}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({calls}));
 }}));
 const original=ctx.llm.stream;
 ctx.llm.stream=async function*(request){
  request.signal.throwIfAborted();
  if(!request.system?.startsWith('你是手绘参考板'))throw new Error('Real model calls are disabled in this test profile');
  const text=request.messages[0].content.find(c=>c.type==='text').text;
  const input=JSON.parse(text.slice(text.indexOf('{')));
  const call={goal:input.goal,ms:Date.now(),aborted:false};calls.push(call);request.signal.addEventListener('abort',()=>{call.aborted=true;},{once:true});console.log('MOCK_SKETCH_MODEL_CALL',calls.length,input.goal);
  if(input.goal?.includes('慢请求'))await new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,60000);
   request.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(request.signal.reason);},{once:true});
  });
  request.signal.throwIfAborted();
  const elements=input.elements??[],target=elements.find(e=>e.type==='rectangle')??elements[0];
  const suggestions=[
   {kind:'improve',title:'增加导航留白',reason:'让导航内容更清晰。',actionPrompt:'根据所附手绘参考图，增加导航上下留白。',...(target?{anchor:{type:'element',elementId:target.id}}:{})},
   {kind:'improve',title:'统一卡片间距',reason:'保持布局节奏一致。',actionPrompt:'根据所附手绘参考图，统一卡片间距。',anchor:{type:'element',elementId:'not-in-this-analysis'}},
   {kind:'clarify',title:'确认页面用途',reason:'用途决定内容重点。',actionPrompt:'根据所附手绘参考图，先确认页面目标。'},
  ];
  yield {type:'text-delta',index:0,text:input.goal?.includes('格式错误')?'{not JSON':JSON.stringify({summary:'模拟布局建议：用于协议与界面测试',suggestions})};
  yield {type:'finish',reason:{kind:'stop'}};
 };
 ctx.effect(()=>()=>{ctx.llm.stream=original;});
}
