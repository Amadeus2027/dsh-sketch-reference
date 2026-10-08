// Fixed-version DSH/React test inspection. Production exposes no test globals.
export async function prepareHost(page,url){
 await page.goto(url);
 for(let i=0;i<5;i++){
  await page.waitForTimeout(300);
  for(const name of ['Continue','Configure later']){const b=page.getByRole('button',{name,exact:true});if(await b.isVisible().catch(()=>false))await b.click();}
 }
 const choose=page.getByRole('button',{name:'Choose workspace',exact:true});
 if(await choose.isVisible()){
  await choose.click();const existing=page.getByRole('menuitem',{name:'dsh-sketch-reference',exact:true});
  if(await existing.isVisible())await existing.click();else{await page.getByRole('button',{name:'Edit path',exact:true}).click();const path=page.getByRole('textbox',{name:'Edit path',exact:true});await path.fill(process.cwd());await path.press('Enter');await page.getByRole('button',{name:'Open',exact:true}).click();}
 }
 await page.getByRole('button',{name:'打开手绘参考板'}).waitFor();
}
export async function hostContext(page,operation,arg){
 return page.evaluate(async({operation,arg})=>{
  const node=document.querySelector('[aria-label="打开手绘参考板"]');let fiber=node?.[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))],ctx;
  for(;fiber;fiber=fiber.return)if(fiber.memoizedProps?.ctx){ctx=fiber.memoizedProps.ctx;break;}
  if(!ctx)throw new Error('Pinned fixture context unavailable');
  if(operation==='theme'){ctx.get('theme').setTheme(arg);return;}
  const ui=ctx.get('uiWorkspace');
  if(operation==='create'){
   const workspace=ui.workspaces.list.getSnapshot().items.find(w=>w.path===arg);
   if(!workspace)throw new Error('Fixture workspace missing');
   const id=await ui.sessions.create({workspaceId:workspace.workspaceId});ui.openSession(id);return id;
  }
  if(operation==='createAt'){const id=await ui.sessions.create({cwd:arg});ui.openSession(id);return id;}
  if(operation==='open'){ui.openSession(arg);return;}
  if(operation==='archive')return ui.archiveSession(arg);
  if(operation==='unarchive')return ui.unarchiveSession(arg);
  throw new Error('Unknown fixture operation');
 },{operation,arg});
}
export async function editorFrame(page){return (await page.locator('iframe[title="手绘参考板"]').elementHandle()).contentFrame();}
export function installEditorInspection(){
 // Chromium may run an iframe init script while its URL is still about:blank.
 // Install test inspection in every document; callers only use editor frames.
 window.__sketchEditor=()=>{
  const node=document.querySelector('main.board');let fiber=node?.[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];
  for(;fiber;fiber=fiber.return)for(const candidate of [fiber,fiber.alternate])for(let hook=candidate?.memoizedState;hook;hook=hook.next){const value=hook.memoizedState;if(value?.getSceneElements&&value?.updateScene)return value;}
  throw new Error('Editor API not ready');
 };
 window.__sketchMetrics={backups:0,longTasks:[],hashes:0,rasterizations:0};
 const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('dsh-sketch:v1:'))window.__sketchMetrics.backups++;return original.call(this,key,value);};
 const rasterize=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){window.__sketchMetrics.rasterizations++;return rasterize.apply(this,args);};
 const hash=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(...args)=>{window.__sketchMetrics.hashes++;return hash(...args);};
 new PerformanceObserver(list=>window.__sketchMetrics.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
}
