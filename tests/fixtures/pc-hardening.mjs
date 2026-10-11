// Isolated no-credentials profile only. Instruments real operations; no LLM calls.
export const inject=['sketchReference','webServer','connection'];
export function apply(ctx){
 const service=ctx.get('sketchReference'),operation=service.operation,metrics=[];
 service.operation=async function(method,body,signal){
  const start=performance.now();let ok=false;
  try{const value=await operation.call(this,method,body,signal);ok=true;return value;}
  finally{metrics.push({method,ms:performance.now()-start,ok});if(metrics.length>2000)metrics.shift();}
 };
 ctx.effect(()=>()=>{service.operation=operation;});
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/sketch-reference-test-hardening',handler:(req,res)=>{
  const rejection=ctx.connection.requestRejection(req);if(rejection){res.writeHead(rejection);res.end();return;}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify({metrics,eventClients:service.events.size,memory:process.memoryUsage()}));
 }}));
}
