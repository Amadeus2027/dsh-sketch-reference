// Run only on an isolated installed DSH profile. The project edit is a fixture write.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {relative,join} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {prepareHost,hostContext,editorFrame} from './fixtures/browser-session.mjs';
const out=process.env.DSH_TEST_OUTPUT??'test-results';
const workspace=process.env.DSH_TEST_WORKSPACE??process.cwd();
await mkdir(join(workspace,'test-results'),{recursive:true});
const dir=await mkdtemp(join(workspace,'test-results/web-review-')),file=join(dir,'index.html');
const path=relative(workspace,file).replaceAll('\\','/');
const html=title=>'<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="site.css"></head><body class="layout"><button id="search">'+title+'</button><script>document.body.dataset.scriptRan="yes"</script></body></html>';
await writeFile(file,html('搜索'));await writeFile(join(dir,'site.css'),'#search{margin:40px;background:rgb(64,100,160);color:white;padding:16px;}');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:900}});await prepareHost(page,process.env.DSH_SMOKE_URL);const first=await hostContext(page,'create',workspace);
 const input=page.locator('[contenteditable=true]');await input.fill('已有任务文字');
 const open=async()=>{await page.getByRole('button',{name:'打开手绘参考板',exact:true}).click();const board=await editorFrame(page);await board.getByRole('button',{name:'网页批注',exact:true}).click();await page.getByLabel('工作区 HTML 路径').waitFor();};
 await open();
 const pathname=page.getByLabel('工作区 HTML 路径'),review=page.getByRole('region',{name:'网页批注'});
 await pathname.fill(path);await review.getByRole('button',{name:'打开网页'}).click();
 const preview=page.frameLocator('iframe[title="网页排版预览"]'),button=preview.locator('#search');
 await expect(button).toHaveText('搜索');await expect(button).toHaveCSS('background-color','rgb(64, 100, 160)');
 assert.equal(await preview.locator('body').getAttribute('data-script-ran'),null);
 assert.equal(await preview.locator('body').getAttribute('class'),'layout');
 const select=async()=>{
  await review.getByRole('button',{name:'圈选区域'}).click();
  const b=await button.boundingBox();await page.mouse.move(b.x+2,b.y+2);await page.mouse.down();await page.mouse.move(b.x+b.width-2,b.y+b.height-2,{steps:8});await page.mouse.up();
 };
 await select();await review.getByLabel('修改意见').fill('将搜索按钮移到右侧');
 const submit=review.getByRole('button',{name:'加入当前聊天'});await expect(submit).toBeEnabled();
 // CSS-only writes and HTML writes both reach the open review through DSH resources.
 await writeFile(join(dir,'site.css'),'#search{margin:40px;background:rgb(80,120,90);color:white;padding:16px;}');
 await expect(button).toHaveCSS('background-color','rgb(80, 120, 90)',{timeout:15000});await expect(submit).toBeDisabled();
 await writeFile(file,html('查找商品'));await expect(button).toHaveText('查找商品',{timeout:15000});
 assert.equal(await review.getByLabel('修改意见').inputValue(),'将搜索按钮移到右侧');
 await select();
 await mkdir(out,{recursive:true});await review.screenshot({path:join(out,'web-review-wide.png')});
 await page.setViewportSize({width:390,height:844});await expect(submit).toBeDisabled();await select();await expect(submit).toBeEnabled();
 await hostContext(page,'theme','dark');
 await expect.poll(()=>review.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await review.screenshot({path:join(out,'web-review-narrow-dark.png')});await hostContext(page,'theme','light');
 await submit.click();await expect(page.locator('iframe[title="手绘参考板"]')).toHaveCount(0);
 const text=await input.innerText();for(const expected of ['已有任务文字',path,'search','查找商品','将搜索按钮移到右侧','SHA-256'])assert(text.includes(expected),expected);
 await page.setViewportSize({width:1500,height:900});await open();await expect(button).toHaveText('查找商品');await expect(review.getByLabel('修改意见')).toHaveValue('将搜索按钮移到右侧');
 await mkdir(out,{recursive:true});await page.screenshot({path:join(out,'web-review.png')});
 await review.getByRole('button',{name:'返回草图'}).click();
 const board=await editorFrame(page);await board.getByRole('button',{name:'返回聊天 ×'}).click();
 await expect(page.locator('iframe[title="手绘参考板"]')).toHaveCount(0);
 await hostContext(page,'create',workspace);await open();
 await expect(pathname).toHaveValue('index.html');
 // Load the same file for this session before checking its independent feedback draft.
 await pathname.fill(path);await review.getByRole('button',{name:'打开网页'}).click();
 await expect(button).toHaveText('查找商品');await expect(review.getByLabel('修改意见')).toHaveValue('');
 await expect(submit).toBeDisabled();
 await hostContext(page,'open',first);await expect(input).toContainText('将搜索按钮移到右侧');
 console.log('PASS: workspace HTML/CSS, static isolation, circle selection, stale rejection, preserved note, native unsent draft and session reopen. No model call.');
}finally{await browser.close();}
