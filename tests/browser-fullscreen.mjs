// Actual installed DSH Web + native composer + built plugin. No model calls.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepareHost,hostContext,installEditorInspection} from './fixtures/browser-session.mjs';
const url=process.env.DSH_SMOKE_URL;if(!url)throw Error('Set DSH_SMOKE_URL to a dedicated authenticated host URL');
const out=process.env.DSH_TEST_OUTPUT??'test-results/graph/native';await mkdir(out,{recursive:true});const workspace=resolve(out,'workspace');await mkdir(workspace,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});await context.addInitScript(installEditorInspection);const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await prepareHost(page,url);for(const name of ['继续','稍后配置']){const button=page.getByRole('button',{name,exact:true});if(await button.isVisible())await button.click();}await hostContext(page,'create',process.env.DSH_TEST_WORKSPACE??resolve(process.env.USERPROFILE,'Desktop'));const input=page.locator('[contenteditable=true]');await input.fill('全屏切换保留原生草稿（不发送）');
 await page.getByRole('button',{name:'打开手绘参考板',exact:true}).click();const iframe=page.locator('iframe[title="手绘参考板"]'),frame=page.frameLocator('iframe[title="手绘参考板"]');await frame.getByLabel('这张图准备用来做什么？').fill('全屏实机回归');
 await page.evaluate(()=>{window.__originalComposer=document.querySelector('[contenteditable=true]');window.__originalFrame=document.querySelector('iframe[title="手绘参考板"]');});const src=await iframe.getAttribute('src');
 const half=await iframe.boundingBox();assert(half.width<1100&&half.width>400);
 await page.getByRole('button',{name:'画板全屏',exact:true}).click();await page.locator('[data-sketch-fullscreen=true]').waitFor();
 assert.equal(await iframe.getAttribute('src'),src);assert(await page.evaluate(()=>window.__originalComposer===document.querySelector('[contenteditable=true]')&&window.__originalFrame===document.querySelector('iframe[title="手绘参考板"]')));
 const full=await iframe.boundingBox();assert(full.x<1&&full.y<1&&full.width>=1439&&full.height>=959);
 const floating=page.locator('[data-sketch-fullscreen=true] [data-collapsed]');const before=await floating.boundingBox();const handle=await page.getByRole('toolbar',{name:'移动悬浮对话'}).boundingBox();await page.mouse.move(handle.x+40,handle.y+14);await page.mouse.down();await page.mouse.move(handle.x+380,handle.y-100,{steps:10});await page.mouse.up();const after=await floating.boundingBox();assert(after.x>before.x+200);
 await page.getByRole('button',{name:'收起悬浮对话',exact:true}).click();await expect(input).toBeHidden();await page.getByRole('button',{name:'展开悬浮对话',exact:true}).click();assert((await input.innerText()).includes('保留原生草稿'));
 await page.screenshot({path:out+'/fullscreen.png'});
 await page.setViewportSize({width:390,height:844});await expect.poll(async()=>{const r=await floating.boundingBox();return r.x>=0&&r.y>=0&&r.x+r.width<=391&&r.y+r.height<=845;}).toBe(true);await page.screenshot({path:out+'/narrow.png'});
 await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'退出画板全屏',exact:true}).click();assert.equal(await iframe.getAttribute('src'),src);assert((await input.innerText()).includes('保留原生草稿'));await expect(page.getByRole('separator',{name:'调整聊天和画板宽度'})).toBeVisible();
 await page.screenshot({path:out+'/half.png'});await frame.getByRole('button',{name:'返回聊天 ×',exact:true}).click();await expect(iframe).toHaveCount(0);assert((await input.innerText()).includes('保留原生草稿'));assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({ok:true,cases:['default split retained','fullscreen fills viewport','same native composer and iframe DOM retained','draft retained','floating drag','collapse and expand','390px clamp','restore split and close'],errors,realModel:false},null,2));console.log('PASS: actual DSH fullscreen, floating native chat, same iframe/composer, drafts, drag, collapse, narrow viewport and split restoration; no model calls.');
}catch(error){await page.screenshot({path:out+'/failure.png'});throw error;}finally{await browser.close();}
