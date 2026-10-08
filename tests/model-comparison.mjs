// Opt-in live comparison through the existing, authenticated DSH RPC.
// Use a dedicated prepared session with the real DS route; never load mock-model.overlay.yml.
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const url=process.env.DSH_SMOKE_URL,sessionId=process.env.DSH_COMPARE_SESSION_ID;
if(!url||!sessionId||process.env.DSH_COMPARE_REAL!=='1')throw new Error('Set DSH_SMOKE_URL, DSH_COMPARE_SESSION_ID and DSH_COMPARE_REAL=1 after configuring a real DS route in a dedicated test profile. This runs three paid model requests and replaces its latest advice.');
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
const report={createdAt:new Date().toISOString(),modelSource:'DSH configured route; operator must verify no mock model is installed',qualityValidation:'Not graded: human ground-truth and review required',trials:[]};
try{
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(url);
 // Read the explicitly selected saved session, independent of host UI navigation.
 const editor=new URL('/sketch-reference-assets/index.html',url);editor.searchParams.set('sessionId',sessionId);await page.goto(editor.href);
 const frame=page;await frame.getByLabel('这张图准备用来做什么？').waitFor();
 await frame.getByRole('status').filter({hasText:'已保存'}).waitFor();
 const download=page.waitForEvent('download');await frame.getByRole('button',{name:'更多操作',exact:true}).click();await frame.getByRole('button',{name:'导出 PNG',exact:true}).click();const png=await download;
 const pngBase64=(await readFile(await png.path())).toString('base64');
 const call=async(method,owner,payload)=>{
  const response=await context.request.post(new URL('/sketch-reference-rpc/v1/'+method,url).href,{data:{protocolVersion:1,requestId:crypto.randomUUID(),owner,payload},timeout:190000});
  const result=await response.json();if(!result.ok)throw new Error(`${result.error.code}: ${result.error.message}`);return result.value;
 };
 const loaded=await call('drawing/get',null,{sessionId});
 if(!loaded.drawing?.scene.elements.length)throw new Error('Prepare a non-empty sketch in this dedicated session first.');
 const route=loaded.routes.find(r=>!process.env.DSH_COMPARE_PROVIDER||r.provider===process.env.DSH_COMPARE_PROVIDER);
 if(!route)throw new Error('No configured vision-capable DS route. Configure it in DSH first.');
 Object.assign(report,{route,sceneRevision:loaded.drawing.revision,contentDigest:loaded.drawing.contentDigest,goal:loaded.drawing.goal,elementIds:loaded.drawing.scene.elements.map(e=>e.id)});
 for(const inputMode of ['image','structure','hybrid']){
  const started=Date.now();
  try{
   const batch=await call('advice/generate',loaded.owner,{revision:loaded.drawing.revision,pngBase64,route,inputMode});
   if(batch.advice.summary.includes('模拟布局建议'))throw new Error('Mock output detected; this is not real-model evidence. Remove the test overlay.');
   report.trials.push({inputMode,elapsedMs:Date.now()-started,advice:batch.advice,anchoredCount:batch.advice.suggestions.filter(s=>s.anchor).length,manualReview:{understanding1to5:null,semanticTargetCorrectness:null,validAnchorsCorrect:null,actionability1to5:null,notes:''}});
   console.log(`Completed ${inputMode}; human quality grading still required.`);
  }catch(error){report.trials.push({inputMode,elapsedMs:Date.now()-started,error:error.message});console.log(`${inputMode} failed; no AI result recorded.`);}
 }
}finally{
 const output='test-results/model-comparison-'+report.createdAt.replaceAll(':','-')+'.json';await writeFile(output,JSON.stringify(report,null,2));console.log(`Saved ${output}. This is not an automatic quality score.`);await browser.close();
}
if(report.trials.length!==3||report.trials.some(t=>t.error))process.exitCode=1;
