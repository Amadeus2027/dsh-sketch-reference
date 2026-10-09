import assert from 'node:assert/strict';

/** Browser-only transport faults; the installed host and storage remain real. */
export async function verifyAgentRecovery(page,frame,call,owner,batch){
 const mode=process.env.DSH_AGENT_FAULT_CASE??'all';
 assert(['all','refresh','race'].includes(mode));
 const card=frame.locator('.commentCard').first();
 if(mode!=='race'){
  for(const committed of [false,true]){
  const attempts=[];
  const write=async route=>{
   attempts.push(route.request().postDataJSON());
   if(attempts.length===1){if(committed){const response=await route.fetch();assert.equal(response.status(),200);}await fail(route,'模拟批注保存故障');}else await route.continue();
  };
  const read=route=>fail(route,'模拟批注读取故障');
  await page.route('**/agent/update',write);
  await card.getByRole('button',{name:'标记已解决'}).click();
  await frame.getByRole('button',{name:'重试 Agent 批注保存'}).waitFor();
  await page.route('**/agent/get',read);
  await frame.getByRole('button',{name:'刷新 Agent 批注',exact:true}).click();
  await frame.getByRole('alert').filter({hasText:'模拟批注读取故障'}).waitFor();
  assert.equal(await frame.getByRole('button',{name:'重试 Agent 批注保存'}).count(),1,'Failed refresh must retain the uncertain mutation');
  await frame.getByRole('button',{name:'返回聊天 ×'}).click();
  await frame.getByRole('alert').filter({hasText:'批注状态尚未确认保存'}).waitFor();
  assert.equal(await page.locator('iframe[title="手绘参考板"]').count(),1);
  await page.unroute('**/agent/get',read);
  const unavailable=async route=>{const request=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,requestId:request.requestId,value:{available:false,batch:null}})});};
  await page.route('**/agent/get',unavailable);
  await frame.getByRole('button',{name:'刷新 Agent 批注',exact:true}).click();
  await frame.getByRole('alert').filter({hasText:'Agent 工具暂不可用'}).waitFor();
  assert.equal(await frame.getByRole('button',{name:'重试 Agent 批注保存'}).count(),1,'Unavailable tools do not confirm an uncertain mutation');
  assert.equal(await frame.locator('.commentCard').count(),3,'A missing tool service is not an authoritative empty batch');
  await page.unroute('**/agent/get',unavailable);
  assert.equal((await call('agent/get',owner,null)).batch.comments[0].status,committed?'resolved':'open');
  await frame.getByRole('button',{name:'重试 Agent 批注保存'}).click();
  await frame.locator('.commentCard.resolved').waitFor();
  assert.equal(attempts.length,2);assert.deepEqual(attempts[1].payload,attempts[0].payload,'Retry must reuse mutation ID and CAS input');
  await page.unroute('**/agent/update',write);
  await card.getByRole('button',{name:'重新打开'}).click();await card.getByRole('button',{name:'标记已解决'}).waitFor();
  }
 }
 if(mode!=='refresh'){
  // Hold an old read until a newer state write succeeds, then hold the follow-up.
  let count=0,releaseOld,releaseNew,seenOld,seenNew;
  const oldSeen=new Promise(r=>{seenOld=r;}),newSeen=new Promise(r=>{seenNew=r;});
  const oldGate=new Promise(r=>{releaseOld=r;}),newGate=new Promise(r=>{releaseNew=r;});
  const jobs=[];
  const read=route=>{
   const task=(async()=>{
   const sequence=++count;
   if(sequence>2){await route.continue();return;}
   const response=await route.fetch();
   if(sequence===1){seenOld();await oldGate;}else{seenNew();await newGate;}
   await route.fulfill({response});
   })();jobs.push(task);return task;
  };
  await page.route('**/agent/get',read);
  try{
   await frame.getByRole('button',{name:'刷新批注',exact:true}).click();await within(oldSeen);
   await card.getByRole('button',{name:'标记已解决'}).click();await frame.locator('.commentCard.resolved').waitFor();
   releaseOld();await within(newSeen);
   assert((await card.getAttribute('class')).includes('resolved'),'A delayed old read must not replace a confirmed state write');
   releaseNew();await frame.locator('.commentCard.resolved').waitFor();
  }finally{releaseOld();releaseNew();await Promise.all(jobs);await page.unroute('**/agent/get',read);}
  assert.equal((await call('agent/get',owner,null)).batch.id,batch.id);
  await card.getByRole('button',{name:'重新打开'}).click();await card.getByRole('button',{name:'标记已解决'}).waitFor();
 }
 if(mode==='all'){
  await page.waitForFunction(async()=>{const value=await (await fetch('/sketch-reference-test-agent-stats')).json();return value.eventClients===1;});
  await page.evaluate(async()=>{const response=await fetch('/sketch-reference-test-agent-stats',{method:'POST'});if(response.status!==204)throw new Error('Event disconnect fixture unavailable');});
  await frame.getByRole('status').filter({hasText:'批注实时同步已断开'}).waitFor();
  await page.waitForFunction(async()=>{const value=await (await fetch('/sketch-reference-test-agent-stats')).json();return value.eventClients===0;});
  await frame.getByRole('button',{name:'刷新 Agent 批注',exact:true}).click();
  await page.waitForFunction(async()=>{const value=await (await fetch('/sketch-reference-test-agent-stats')).json();return value.eventClients===1;});
  await frame.getByRole('status').filter({hasText:'批注实时同步已断开'}).waitFor({state:'detached'});
 }
}
async function fail(route,message){
 const request=route.request().postDataJSON();
 await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,requestId:request.requestId,error:{code:'TEST_TRANSPORT_FAILURE',message}})});
}
async function within(task){
 let timer;
 try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Expected intercepted read did not arrive')),20000);})]);}
 finally{clearTimeout(timer);}
}
