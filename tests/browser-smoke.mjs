// Run against a dedicated local DSH Web profile, without real model calls.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const url=process.env.DSH_SMOKE_URL;
if(!url)throw new Error('Set DSH_SMOKE_URL to the authenticated local Web URL. Use a dedicated test profile.');
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],remoteFonts=[];let latestDrawing;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/https:\/\/esm.sh\//.test(r.url()))remoteFonts.push(r.url());});
 page.on('response',async r=>{if(r.url().includes('/drawing/save')&&r.status()===200)latestDrawing=(await r.json()).value;});
 await page.goto(url);
 for(let round=0;round<5;round++){
  await page.waitForTimeout(500);
  for(const name of ['Continue','Configure later']){const b=page.getByRole('button',{name,exact:true});if(await b.isVisible().catch(()=>false)){await b.click();await page.waitForTimeout(500);}}
 }
 const choose=page.getByRole('button',{name:'Choose workspace',exact:true});
 if(await choose.isVisible()){
  await choose.click();const existing=page.getByRole('menuitem',{name:'dsh-sketch-reference',exact:true});if(await existing.isVisible()){await existing.click();}else{await page.getByRole('button',{name:'Edit path',exact:true}).click();const path=page.getByRole('textbox',{name:'Edit path',exact:true});await path.fill(process.cwd());await path.press('Enter');await page.getByRole('button',{name:'Open',exact:true}).click();}
 }
 const input=page.locator('[contenteditable=true]');await input.fill('保留已有文字');
 console.log('opening board');await page.getByRole('button',{name:'打开手绘参考板'}).click();let frame=page.frameLocator('iframe[title="手绘参考板"]');
 await frame.getByLabel('这张图准备用来做什么？').fill('根据草图制作中文首页');
 await frame.locator('.excalidraw').click();await page.keyboard.press('r');const box=await frame.locator('.excalidraw').boundingBox();assert(box);
 await page.mouse.move(box.x+140,box.y+170);await page.mouse.down();await page.mouse.move(box.x+400,box.y+380,{steps:10});await page.mouse.up();
 await page.keyboard.press('t');await page.mouse.click(box.x+180,box.y+220);await page.keyboard.insertText('首页 · 搜索');await page.keyboard.press('Escape');
 await frame.getByRole('status').filter({hasText:'已保存'}).waitFor({timeout:15000});assert(latestDrawing?.scene.elements.length>=2);
 console.log('exporting PNG');const downloading=page.waitForEvent('download');await frame.getByRole('button',{name:'导出 PNG',exact:true}).click();const png=await downloading;await png.saveAs('test-results/reference.png');
 const bytes=await readFile('test-results/reference.png');assert(bytes.length>100);assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 await page.locator('input[type=file]').setInputFiles({name:'existing.png',mimeType:'image/png',buffer:bytes});
 console.log('staging image');await frame.getByRole('button',{name:'作为参考发送',exact:true}).click();await frame.getByRole('alert').filter({hasText:'参考图已加入左侧输入框'}).waitFor();
 assert((await input.innerText()).includes('保留已有文字'));await page.getByRole('img',{name:'existing.png',exact:true}).waitFor();await page.getByRole('img',{name:'sketch-reference.png',exact:true}).first().waitFor();
 await frame.getByRole('button',{name:'作为参考发送',exact:true}).click();await frame.getByRole('alert').filter({hasText:'这张参考图已经在输入框中'}).waitFor();
 await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});
 await page.getByRole('button',{name:'打开手绘参考板'}).click();frame=page.frameLocator('iframe[title="手绘参考板"]');assert.equal(await frame.getByLabel('这张图准备用来做什么？').inputValue(),'根据草图制作中文首页');
 const child=await page.locator('iframe[title="手绘参考板"]').elementHandle();assert(child);
 const loaded=await (await child.contentFrame()).evaluate(async()=>{const params=new URLSearchParams(location.search);return (await (await fetch('/sketch-reference-rpc/v1/drawing/get',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId:crypto.randomUUID(),owner:null,payload:{sessionId:params.get('sessionId')}})})).json()).value;});
 assert(loaded.drawing.scene.elements.some(e=>e.type==='text'&&e.text==='首页 · 搜索'));
 await page.screenshot({path:'test-results/board.png'});
 await page.setViewportSize({width:900,height:900});await frame.getByRole('button',{name:'返回聊天 ×'}).click();await page.locator('iframe[title="手绘参考板"]').waitFor({state:'detached'});assert((await input.innerText()).includes('保留已有文字'));
 const anonymous=await browser.newContext();const response=await anonymous.request.post(new URL('/sketch-reference-rpc/v1/drawing/get',url).href,{data:{}});assert.equal(response.status(),401);await anonymous.close();
 assert.deepEqual(errors,[]);assert.deepEqual(remoteFonts,[]);
 console.log('PASS: draw, Chinese PNG, persisted editable scene, close/reopen, native attachments, existing input, duplicate prevention, narrow screen close, anonymous rejection, no CDN requests. No real DS calls.');
}finally{await browser.close();}
