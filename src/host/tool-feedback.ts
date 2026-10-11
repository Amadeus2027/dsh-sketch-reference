import {ZodError} from 'zod';
import {assertSupportedJsonSchema,validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';
import type {ToolDefinition,ToolResult,ToolResultView,ParameterSchemaSpec,JsonSchemaNode} from '@deepseek-ai/dsh-tools';
import {SketchError} from '../core/contracts.ts';

/** The pinned host supports oneOf, but not numeric/string/array bound keywords. */
export const editOperationParameters={oneOf:[
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'create',required:true},type:{type:'string',enum:['rectangle','ellipse','diamond'],required:true},x:{type:'number',required:true},y:{type:'number',required:true},width:{type:'number',required:true},height:{type:'number',required:true}}},
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'create',required:true},type:{type:'string',const:'arrow',required:true},x:{type:'number',required:true,description:'Arrow tail scene x.'},y:{type:'number',required:true,description:'Arrow tail scene y.'},width:{type:'number',required:true,description:'Absolute horizontal span; may be zero for a vertical arrow.'},height:{type:'number',required:true,description:'Absolute vertical span; may be zero for a horizontal arrow.'},points:{type:'array',description:'Optional exactly [[0,0],[dx,dy]]; signed dx/dy determine direction, abs(dx)=width and abs(dy)=height. Last point is the arrowhead. Default [[0,0],[width,height]].',items:{type:'array',items:{type:'number'}}}}},
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'create',required:true},type:{type:'string',const:'text',required:true},x:{type:'number',required:true},y:{type:'number',required:true},width:{type:'number',required:true},height:{type:'number',required:true},text:{type:'string',required:true,description:'Nonblank; at most 500 Unicode codepoints. Use newline/spaces, not carriage return or tab.'}}},
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'move',required:true},elementId:{type:'string',required:true},x:{type:'number',required:true},y:{type:'number',required:true}}},
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'resize',required:true},elementId:{type:'string',required:true},width:{type:'number',required:true},height:{type:'number',required:true}}},
 {type:'object',additionalProperties:false,properties:{op:{type:'string',const:'delete',required:true},elementId:{type:'string',required:true}}},
]} as const satisfies NonNullable<ParameterSchemaSpec[string]>;

const guidance:Record<string,string>={
 sketch_read:'按 ID 读取须同时提供 mode=elements 和摘要 revision；elementIds 为 1–50 个真实 ID。scope=focus 须提供 revision，且不能同时带 elementIds；offset 为 0–2000 的整数。',
 sketch_annotate:'comments 至少一条，只提出有价值且不重复的批注，整个输入最多 64 KiB；summary 最多 240、title 最多 60、reason 最多 1000 个 Unicode 字符，均非空且不能含空字符。revision/expectedBatchId 使用摘要中的 UUID；无批次时使用 JSON null。',
 sketch_propose_edit:'operations 必须为 1–20 条，总输入不超过 16 KiB；仅提供对应操作的字段。坐标范围 ±100000，尺寸大于 0 且不超过 100000（箭头允许单个零跨度、每个非零跨度必须大于 1）；箭头 points 仅为 [[0,0],[dx,dy]]，绝对跨度与 width/height 一致；summary 最多 240、text 最多 500 个 Unicode 字符且非空。revision/expectedProposalId 使用摘要中的 UUID；无提议时使用 JSON null。',
 sketch_read_image:'revision 使用当前摘要的 UUID；scope 仅为 all 或 focus。',
};

// Stable runtime/PTC contracts. Native models obtain these keys from descriptions;
// this metadata is not sent as a native tool's output schema to the model.
const string={type:'string'} as const,integer={type:'integer'} as const;
const object=(properties:Record<string,JsonSchemaNode>,required:string[]):JsonSchemaNode=>({type:'object',additionalProperties:true,properties,required});
const resultSchemas:Record<string,JsonSchemaNode>={
 sketch_read:{oneOf:[
  object({hasDrawing:{type:'boolean',const:false},revision:{type:'null'},message:string},['hasDrawing','revision','message']),
  object({hasDrawing:{type:'boolean',const:true},revision:string,totalElements:integer,elements:{type:'array',items:object({id:string,type:string,allowedOperations:{type:'array',items:{type:'string',enum:['move','resize','delete']}}},['id','type'])},truncated:{type:'boolean'},nextOffset:{oneOf:[integer,{type:'null'}]},scope:{type:'string',enum:['all','focus']}},['hasDrawing','revision','totalElements','elements','truncated','nextOffset','scope']),
 ]},
 sketch_annotate:object({batchId:string,revision:string,count:integer,message:string,unanchored:integer},['batchId','revision','count','message']),
 sketch_propose_edit:object({proposalId:string,revision:string,status:{type:'string',enum:['pending','applied','dismissed']},operationCount:integer,message:string},['proposalId','revision','status','operationCount','message']),
 sketch_read_image:object({revision:string,scope:{type:'string',enum:['all','focus']},elementIds:{type:'array',items:string},elementCount:integer,elementIdsTruncated:{type:'boolean'},image:object({attachmentId:string,mediaType:{type:'string',const:'image/png'},bytes:integer,width:integer,height:integer},['attachmentId','mediaType','bytes','width','height']),instruction:string},['revision','scope','elementIds','elementCount','elementIdsTruncated','image','instruction']),
};

/** Keep validation strict; never echo untrusted argument values into an error. */
export function recoverableTool(tool:ToolDefinition):ToolDefinition{
 const parameters={...tool.parameters,additionalProperties:false} as const;
 const output={...tool.output,schema:resultSchemas[tool.name]??tool.output.schema};
 assertSupportedJsonSchema(parameters);assertSupportedJsonSchema(output.schema);
 return {...tool,parameters,output,execute:async(args,exec)=>{
  // Execute the advertised root too: defineTool's closure retains its implicit
  // open root. This keeps the public contract and the actual entry gate equal.
  if(validateJsonSchemaValue(parameters,args).length)throw new SketchError('INVALID_ARGUMENTS',`草图工具参数形状无效。请只提供声明中的字段和对应操作的必填项。${guidance[tool.name]??''}`,422);
  try{return await tool.execute(args,exec);}catch(error){
   if(!(error instanceof ZodError))throw error;
   // Property names may themselves be hostile input. Advertise only known paths.
   const fields=new Set(['revision','expectedBatchId','expectedProposalId','summary','comments','title','reason','anchor','elementId','elementIds','mode','scope','offset','operations','op','type','x','y','width','height','text','points','commentReference']);
   const paths=[...new Set(error.issues.slice(0,4).map(issue=>issue.path.filter(p=>typeof p==='number'||fields.has(String(p))).join('.')).filter(Boolean))];
   const extra=error.issues.some(issue=>issue.code==='unrecognized_keys')?'不接受额外字段；':'';
   throw new SketchError('INVALID_ARGUMENTS',`草图工具参数无效${paths.length?`（${paths.join('、')}）`:''}。${guidance[tool.name]??'请按工具声明修正参数。'} ${extra}修正后重试，勿重复提交已成功的操作。`,422);
  }
 }};
}

/** UI-only native projection. Model JSON/images and native error details stay intact. */
export function presentSketchResult(_args:unknown,result:ToolResult):ToolResultView|undefined{
 if(result.isError)return undefined;
 try{
  const block=result.content.find(b=>b.type==='text');
  if(!block||block.type!=='text')return undefined;
  const value:unknown=JSON.parse(block.text);
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const v=value as Record<string,unknown>;
  let text:string|undefined;
  if(v.hasDrawing===false)text='当前会话还没有已保存的草图。';
  else if(v.hasDrawing===true&&Number.isSafeInteger(v.totalElements))text=`已读取${v.scope==='focus'?'选区重点':'草图'}：${v.totalElements} 个元素${v.truncated?'，详情已分页':''}。`;
  else if(typeof v.batchId==='string'&&Number.isSafeInteger(v.count))text=`已保存 ${v.count} 条批注${typeof v.unanchored==='number'&&v.unanchored>0?`（${v.unanchored} 条全局说明）`:''}，图形未改变。`;
  else if(typeof v.proposalId==='string'&&Number.isSafeInteger(v.operationCount))text=v.status==='pending'?`已提出 ${v.operationCount} 项修改，等待在画板预览并确认；图形未改变。`:'已读取历史修改提议；当前画板状态以草图为准。';
  else if(v.image&&typeof v.image==='object'&&typeof (v.image as Record<string,unknown>).attachmentId==='string'&&(v.image as Record<string,unknown>).mediaType==='image/png')text=`已读取${v.scope==='focus'?'选区':'全图'}视觉参考。`;
  return text?{card:'generic',content:[{type:'text',text}]}:undefined;
 }catch{return undefined;}
}
