// Fresh official Web profile, without test overlays or model requests.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.DSH_SMOKE_URL,out=process.env.DSH_TEST_OUTPUT??'test-results/installation';
if(!url)throw Error('Dedicated authenticated profile URL required');
const removed=process.env.DSH_INSTALL_MODE==='removed';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(20000);
 const errors=[];let analyses=0,sent=0;
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().endsWith('/advice/generate'))analyses++;if(request.url().includes('/sessions/')&&request.method()==='POST')sent++;});
 await page.goto(url);
 const welcome=page.getByRole('button',{name:/^(Continue|继续)$/});
 const later=page.getByRole('button',{name:/^(Configure later|稍后配置)$/});
 await welcome.waitFor({state:'visible',timeout:3000}).catch(()=>{});
 if(await welcome.isVisible()){await welcome.click();await later.waitFor({state:'visible',timeout:15000});}
 if(await later.isVisible())await later.click();
 const entry=page.getByRole('button',{name:'打开手绘参考板'});
 if(removed){
  await page.locator('[contenteditable=true]').waitFor();await expect(entry).toHaveCount(0);
  assert.equal((await page.request.get(new URL('/sketch-reference-assets/index.html',url).href)).status(),404);
 }else{
  await expect(entry).toHaveCount(1);await entry.click();
  const board=page.frameLocator('iframe[title="手绘参考板"]');await board.getByRole('heading',{name:'手绘参考板',exact:true}).waitFor();
  assert.equal((await page.request.get(new URL('/sketch-reference-assets/index.html',url).href)).status(),200);
  await board.getByRole('button',{name:'返回聊天 ×',exact:true}).click();await expect(page.locator('iframe[title="手绘参考板"]')).toHaveCount(0);
 }
 assert.deepEqual(errors,[]);assert.equal(analyses,0);assert.equal(sent,0);
 await page.screenshot({path:out+'/'+(removed?'removed':'installed')+'.png'});
 await writeFile(out+'/'+(removed?'removed':'installed')+'.json',JSON.stringify({mode:removed?'removed':'installed',singleEntry:!removed,assetStatus:removed?404:200,errors,analysisRequests:analyses,sessionPostRequests:sent,realModel:false},null,2));
 console.log('PASS '+(removed?'official removal/restart: no entry, assets 404':'official fresh installation: one entry, canvas opens/closes, assets 200')+'; no model requests.');
}finally{await browser.close();}
