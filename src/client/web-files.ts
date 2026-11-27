import type {Context} from '@deepseek-ai/cordis';
import type {Owner} from '../core/contracts.ts';

const fileLimit=512*1024;
interface WebFile {data:Uint8Array;version:string}
export interface WebFiles {
 read(owner:Owner,path:string,signal:AbortSignal):Promise<WebFile>;
 watch(owner:Owner,files:ReadonlyMap<string,string>,change:()=>void):()=>void;
}
interface FileResources {
 source(address:string):{
  subscribe(fn:()=>void):()=>void;
  getSnapshot():{status:string;value?:{version?:string}};
 };
}
type BytesResult={ok:boolean;value?:{absolutePath:string;data:Uint8Array;eof:boolean;version:string}};
interface WorkspaceRemote {
 stat(session:string,path:string,signal:AbortSignal):Promise<{ok:boolean;value?:{absolutePath:string;bytes?:number}}>;
 readBytes(session:string,path:string,options:{range:{offset:number;length:number}},signal:AbortSignal):Promise<BytesResult>;
}

export function relativeWebPath(input:string,base=''):string {
 const value=input.trim().replace(/^\.\//,'');
 if(!value||value.length>512||/[\\:#?%\u0000-\u001f]/.test(value)||value.startsWith('/'))throw Error('请输入工作区相对路径');
 const parts=base.split('/').slice(0,-1);
 for(const part of value.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){if(!parts.length)throw Error('文件须位于当前工作区');parts.pop();}
  else parts.push(part);
 }
 const path=parts.join('/');
 if(!/\.(?:html?|css|png|jpe?g|webp|gif)$/i.test(path))throw Error('此文件类型不支持网页预览');
 return path;
}

/** Optional on older hosts. Use the authenticated, session-scoped DSH Remote. */
export function workspaceReader(ctx:Context):WebFiles {
 let remote:WorkspaceRemote|undefined;
 ctx.inject(['remote','remote.workspaceFiles'],scope=>{
  remote=(scope.get('remote') as unknown as {workspaceFiles:WorkspaceRemote}).workspaceFiles;
  scope.effect(()=>()=>{remote=undefined;});
 });
 let resources:FileResources|undefined;
 ctx.inject(['resources'],scope=>{
  resources=scope.get('resources') as unknown as FileResources;
  scope.effect(()=>()=>{resources=undefined;});
 });
 return {async read(owner,input,signal){
  const path=relativeWebPath(input);
  const service=remote;
  if(!service||typeof service.readBytes!=='function'||typeof service.stat!=='function')throw Error('当前 DSH 未提供工作区文件预览服务');
  const normalize=(p:string)=>p.replaceAll('\\','/').replace(/\/$/,'');
  const expected=normalize(owner.cwd)+'/'+path;
  const checkLocation=(absolutePath:string)=>{
   const actual=normalize(absolutePath);
   if(!owner.cwd||(/^[a-z]:\//i.test(expected)?actual.toLowerCase()!==expected.toLowerCase():actual!==expected))throw Error('文件位置与当前会话工作区不一致');
  };
  // Check the resolved path before reading, and again on the returned bytes.
  const stat=await service.stat(owner.sessionId,path,signal);
  signal.throwIfAborted();
  if(!stat.ok||!stat.value)throw Error('无法读取工作区文件：'+path);
  checkLocation(stat.value.absolutePath);
  if((stat.value.bytes??0)>fileLimit)throw Error('单个预览文件不能超过 512 KiB：'+path);
  const result=await service.readBytes(owner.sessionId,path,{range:{offset:0,length:fileLimit}},signal);
  signal.throwIfAborted();
  if(!result.ok||!result.value)throw Error('无法读取工作区文件：'+path);
  const {data,absolutePath,eof}=result.value;
  checkLocation(absolutePath);
  if(!eof||data.byteLength>fileLimit)throw Error('单个预览文件不能超过 512 KiB：'+path);
  return {data,version:result.value.version};
 },watch(owner,files,change){
  const disposers:Array<()=>void>=[];
  if(resources&&typeof resources.source==='function'){
   try{
    for(const [path,version] of files){
     const address='dsh-resource://file/session/'+encodeURIComponent(owner.sessionId)+'/'+path.split('/').map(encodeURIComponent).join('/');
     const source=resources.source(address);
     const changed=()=>{
      const {status,value}=source.getSnapshot();
      if(status==='failed'||(status==='live'&&value?.version!==version))change();
     };
     disposers.push(source.subscribe(changed));changed();
    }
   }catch{for(const off of disposers.splice(0))off();} // Older profiles can still refresh manually.
  }
  return ()=>{for(const off of disposers)off();};
 }};
}
