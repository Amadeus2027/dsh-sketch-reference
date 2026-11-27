import {expect,it,vi} from 'vitest';
import type {Context} from '@deepseek-ai/cordis';
import {relativeWebPath,workspaceReader} from '../src/client/web-files.ts';

const owner={cwd:'/work',sessionId:'session 1',createdAt:'now'};
function fixture(){
 const stat=vi.fn(async()=>({ok:true,value:{absolutePath:'/work/ui/page.html',bytes:40}}));
 const readBytes=vi.fn(async()=>({ok:true,value:{absolutePath:'/work/ui/page.html',version:'v1',data:new Uint8Array(40),eof:true}}));
 const ctx={inject:(deps:string[],fn:(scope:unknown)=>void)=>{
  if(deps.includes('remote'))fn({get:()=>({workspaceFiles:{stat,readBytes}}),effect:()=>{}});
 }};
 return {files:workspaceReader(ctx as unknown as Context),readBytes,stat};
}
it('resolves linked assets under the workspace and rejects external or non-preview paths',()=>{
 expect(relativeWebPath('../assets/logo.png','pages/home.html')).toBe('assets/logo.png');
 for(const path of ['../../logo.png','/tmp/x.html','https://example.test/x.css','C:\\ui\\x.html','../.env'])expect(()=>relativeWebPath(path,'pages/home.html')).toThrow();
});
it('checks resolved paths and size before requesting a bounded byte range',async()=>{
 const {files,stat,readBytes}=fixture(),signal=new AbortController().signal;
 for(const [absolutePath,bytes] of [['/else/page.html',30],['/work/ui/page.html',600000]] as const){
  stat.mockResolvedValueOnce({ok:true,value:{absolutePath,bytes}});
  await expect(files.read(owner,'ui/page.html',signal)).rejects.toThrow();
 }
 expect(readBytes).not.toHaveBeenCalled();
 await expect(files.read(owner,'ui/page.html',signal)).resolves.toMatchObject({version:'v1'});
 expect(readBytes).toHaveBeenCalledWith(owner.sessionId,'ui/page.html',{range:{offset:0,length:512*1024}},signal);
 readBytes.mockResolvedValueOnce({ok:true,value:{absolutePath:'/other/page.html',version:'v2',data:new Uint8Array(),eof:true}});
 await expect(files.read(owner,'ui/page.html',signal)).rejects.toThrow('工作区');
});
