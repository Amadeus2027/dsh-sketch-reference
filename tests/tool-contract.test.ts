import {it,expect,vi} from 'vitest';
import {ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import {assertSupportedJsonSchema,validateJsonSchemaValue,type ToolDefinition} from '@deepseek-ai/dsh-tools';
import {createSketchTools} from '../src/host/tools.ts';
import {presentSketchResult,recoverableTool} from '../src/host/tool-feedback.ts';
import {agentAnnotateSchema} from '../src/core/agent.ts';
import {proposeEditSchema,allowedOperations,validateOperations} from '../src/core/edits.ts';
import {withComments} from '../src/core/comments.ts';
import {commentSchema,SketchError,type Drawing} from '../src/core/contracts.ts';
import type {SketchAgent} from '../src/host/agent.ts';

function fixture(){
 const read=vi.fn(async()=>({hasDrawing:false,revision:null}));
 const annotate=vi.fn(async(_session,input)=>{agentAnnotateSchema.parse(input);return {batchId:randomUUID(),count:1};});
 const proposeEdit=vi.fn(async(_session,input)=>{proposeEditSchema.parse(input);return {proposalId:randomUUID(),status:'pending',operationCount:1};});
 const readImage=vi.fn(async()=>({image:{prepared:true}}));
 const signal=new AbortController().signal;
 const tools=createSketchTools({read,annotate,proposeEdit,readImage,edits:{},visual:{}} as unknown as SketchAgent,signal,p=>p,async()=>{});
 const exec={signal,callId:'contract',agent:{session:{header:{id:'real-session'}}}} as Parameters<ToolDefinition['execute']>[1];
 return {tools,exec,read,annotate};
}
const base=()=>({revision:randomUUID(),expectedProposalId:null,summary:'调整位置'});
it('registers only schema keywords supported by the pinned DSH and rejects extra root fields',()=>{
 const {tools}=fixture();
 for(const tool of tools){expect(()=>assertSupportedJsonSchema(tool.parameters)).not.toThrow();expect(()=>assertSupportedJsonSchema(tool.output.schema)).not.toThrow();expect(tool.parameters.additionalProperties).toBe(false);}
 expect(()=>assertSupportedJsonSchema({type:'array',items:{type:'string'},maxItems:3})).toThrow('supported keyword');
});
it('advertises disjoint exact shapes for create/text/move/resize/delete',()=>{
 const tool=fixture().tools.find(t=>t.name==='sketch_propose_edit')!;
 const valid=[{op:'create',type:'rectangle',x:0,y:0,width:50,height:30},{op:'create',type:'text',x:0,y:0,width:50,height:30,text:'你好'},{op:'move',elementId:'a',x:20,y:30},{op:'resize',elementId:'a',width:40,height:50},{op:'delete',elementId:'a'}];
 for(const operation of valid)expect(validateJsonSchemaValue(tool.parameters,{...base(),operations:[operation]})).toEqual([]);
 for(const operation of [{...valid[3],x:1},{...valid[0],text:'多余文字'},{...valid[1],text:undefined},{op:'move',elementId:'a',x:1},{...valid[4],width:2}]){
  expect(validateJsonSchemaValue(tool.parameters,JSON.parse(JSON.stringify({...base(),operations:[operation]})))).not.toEqual([]);
 }
 expect(validateJsonSchemaValue(tool.parameters,{...base(),operations:[valid[4]],expectedBatchId:null})).not.toEqual([]);
});
it('turns the real four-comment rejection into actionable feedback without an input echo or write',async()=>{
 const {tools,exec}=fixture(),tool=tools.find(t=>t.name==='sketch_annotate')!;
 const input={revision:randomUUID(),expectedBatchId:null,summary:'摘要',comments:Array.from({length:4},()=>({title:'测试',reason:'说明'}))};
 await expect(tool.execute(input,exec)).rejects.toMatchObject({code:'INVALID_ARGUMENTS',message:expect.stringContaining('1–3')});
 await expect(tool.execute(input,exec)).rejects.toMatchObject({message:expect.not.stringContaining('不接受额外字段')});
 // A valid corrected call still goes through the existing validator, not a permissive fallback.
 await expect(tool.execute({...input,comments:input.comments.slice(0,3)},exec)).resolves.toHaveProperty('batchId');
 const bad={...input,comments:[{title:'😀'.repeat(61),reason:'说明'}]};
 await expect(tool.execute(bad,exec)).rejects.toMatchObject({code:'INVALID_ARGUMENTS',message:expect.not.stringContaining('😀')});
});
it('executes the same closed parameter root advertised to the host before calling the service',async()=>{
 const {tools,exec,read}=fixture(),tool=tools[0]!;
 await expect(tool.execute({PRIVATE_FIELD:'private'},exec)).rejects.toMatchObject({code:'INVALID_ARGUMENTS',message:expect.not.stringContaining('PRIVATE_FIELD')});
 expect(read).not.toHaveBeenCalled();
 await expect(tool.execute({},exec)).resolves.toMatchObject({hasDrawing:false});expect(read).toHaveBeenCalledOnce();
});
it('preserves domain/CAS/cancellation errors instead of labelling every failure an argument error',async()=>{
 const source=fixture().tools[0]!,error=new SketchError('REVISION_CONFLICT','请重新读取');
 const tool=recoverableTool({...source,execute:async()=>{throw error;}});
 await expect(tool.execute({},fixture().exec)).rejects.toBe(error);
 const hostile=new ZodError([{code:'custom',path:['PRIVATE_VALUE'],message:'PRIVATE_VALUE'}]);
 await expect(recoverableTool({...source,execute:async()=>{throw hostile;}}).execute({},fixture().exec)).rejects.toMatchObject({message:expect.not.stringContaining('PRIVATE_VALUE')});
});
it('uses native result cards without changing model JSON, images, failures or older replay data',()=>{
 const content=[{type:'text' as const,text:JSON.stringify({hasDrawing:true,scope:'focus',totalElements:2,truncated:false,revision:randomUUID()})}];
 const before=JSON.stringify(content),view=presentSketchResult({}, {content,isError:false});
 expect(view).toMatchObject({card:'generic',content:[{type:'text',text:'已读取选区重点：2 个元素。'}]});expect(JSON.stringify(content)).toBe(before);
 expect(presentSketchResult({}, {content,isError:true})).toBeUndefined();
 expect(presentSketchResult({}, {content:[{type:'text',text:'old result'}],isError:false})).toBeUndefined();
 expect(presentSketchResult({}, {content:[{type:'text',text:JSON.stringify({proposalId:'p',status:'applied',operationCount:1})}],isError:false})).toMatchObject({content:[{text:expect.stringContaining('历史')}]});
 const image={type:'image' as const,attachment:{sha256:'a'.repeat(64),mimeType:'image/png',byteSize:100}};
 const imageContent=[{type:'text' as const,text:JSON.stringify({scope:'focus',image:{attachmentId:'a',mediaType:'image/png'}})},image];
 const imageBefore=JSON.stringify(imageContent);
 expect(presentSketchResult({}, {content:imageContent as never,isError:false})).toMatchObject({content:[{text:'已读取选区视觉参考。'}]});
 expect(JSON.stringify(imageContent)).toBe(imageBefore);
});
it('keeps advertised capabilities identical to admission including incoming bindings',()=>{
 const scene:Drawing['scene']={elements:[{id:'r',type:'rectangle',x:0,y:0,width:10,height:10},{id:'f',type:'freedraw',x:0,y:0,width:10,height:10}],appState:{},files:{}};
 expect(allowedOperations(scene.elements[0]!)).toEqual(['move','resize','delete']);expect(allowedOperations(scene.elements[1]!)).toEqual(['move','delete']);
 expect(allowedOperations(scene.elements[0]!,'bound')).toEqual([]);
 expect(()=>validateOperations(scene,[{op:'resize',elementId:'f',width:20,height:20}])).toThrow('独立矩形');
 expect(()=>validateOperations(scene,[{op:'move',elementId:'f',x:20,y:20}])).not.toThrow();
});
it('synthesizes three valid distinct legacy UUIDs and preserves their IDs during status updates',()=>{
 const batch={id:randomUUID(),createdAt:new Date().toISOString(),advice:{suggestions:[{}, {}, {}]}};
 const view=withComments(batch);expect(new Set(view.comments.map(c=>c.id)).size).toBe(3);
 for(const comment of view.comments){expect(comment.id).toHaveLength(36);expect(()=>commentSchema.parse(comment)).not.toThrow();}
 expect(withComments(batch).comments).toEqual(view.comments);
});
