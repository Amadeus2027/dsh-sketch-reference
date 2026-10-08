import {describe,it,expect} from 'vitest';
import type {Context} from '@deepseek-ai/cordis';
import {generateAdvice,parseAdvice} from '../src/host/advice.ts';
const advice={summary:'布局参考',suggestions:[{kind:'create',title:'生成页面',reason:'保留图中布局',actionPrompt:'根据所附手绘参考图生成首页。'}]};
function carrier(finish='stop'){let observed:Record<string,unknown>|undefined;const ctx={attachments:{saveImage:async()=>({id:'image'})},llm:{resolveModelInfo:async()=>({inputModalities:['image'],reasoning:{efforts:[{id:'off'}]}}),stream:async function*(request:Record<string,unknown>){observed=request;yield {type:'text-delta',index:0,text:JSON.stringify(advice)};yield {type:'finish',reason:{kind:finish}};}}};return {ctx:ctx as unknown as Context,read:()=>observed};}
describe('DS independent suggestion request',()=>{
 it('sends the actual registered image and goal, with no tools or chat mutation',async()=>{const c=carrier();expect(await generateAdvice(c.ctx,{provider:'deepseek-account',model:'deepseek-flash'},new Uint8Array([1]),'网页首页',new AbortController().signal)).toEqual(advice);const request=c.read()!;expect(request['provider']).toBe('deepseek-account');expect(request['tools']).toBeUndefined();expect(JSON.stringify(request['messages'])).toContain('网页首页');expect(JSON.stringify(request['messages'])).toContain('"attachment":{"id":"image"}');});
 it('rejects incomplete/error finishes even when text resembles valid advice',async()=>{const c=carrier('error');await expect(generateAdvice(c.ctx,{provider:'deepseek-official',model:'deepseek-flash'},new Uint8Array([1]),'',new AbortController().signal)).rejects.toMatchObject({code:'MODEL_FAILED'});});
 it('does not manufacture advice from malformed output',()=>{expect(()=>parseAdvice('这里是您的建议')).toThrow();expect(parseAdvice('```json\n'+JSON.stringify(advice)+'\n```')).toEqual(advice);});
});
