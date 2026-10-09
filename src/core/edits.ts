import {z} from 'zod';
import {canonical,ownerSchema,sceneSchema,drawingSchema,SketchError,type Drawing} from './contracts.ts';

export const EDIT_LIMITS=Object.freeze({operations:20,bytes:16*1024,coordinate:100000,text:500,records:500,storageBytes:128*1024*1024});
const coordinate=z.number().min(-EDIT_LIMITS.coordinate).max(EDIT_LIMITS.coordinate);
const size=z.number().positive().max(EDIT_LIMITS.coordinate);
const id=z.string().min(1).max(256);
const label=(max:number)=>z.string().refine(v=>!!v.trim()&&!v.includes('\0')&&Array.from(v).length<=max);
export const editOperationSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('create'),type:z.enum(['rectangle','ellipse','diamond','text','arrow']),x:coordinate,y:coordinate,width:size,height:size,text:label(EDIT_LIMITS.text).optional()}).strict().superRefine((v,ctx)=>{
  if((v.type==='text')!==!!v.text)ctx.addIssue({code:'custom',message:'只有 text 图形必须提供 text；文字尺寸由 Excalidraw 计算'});
 }),
 z.object({op:z.literal('move'),elementId:id,x:coordinate,y:coordinate}).strict(),
 z.object({op:z.literal('resize'),elementId:id,width:size,height:size}).strict(),
 z.object({op:z.literal('delete'),elementId:id}).strict(),
]);
export const proposeEditSchema=z.object({revision:z.uuid(),expectedProposalId:z.uuid().nullable(),summary:label(240),operations:z.array(editOperationSchema).min(1).max(EDIT_LIMITS.operations)}).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).length<=EDIT_LIMITS.bytes,'修改提议超过大小上限');
export type EditOperation=z.infer<typeof editOperationSchema>;
export const proposalSchema=z.object({id:z.uuid(),owner:ownerSchema,baseRevision:z.uuid(),before:sceneSchema,goal:drawingSchema.shape.goal,summary:label(240),operations:proposeEditSchema.shape.operations,
 createdAt:z.iso.datetime(),status:z.enum(['pending','applied','dismissed']),resultRevision:z.uuid().optional(),applicationDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),toolCallKey:z.string().regex(/^[a-f0-9]{64}$/),toolInputDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((v,ctx)=>{if(v.status==='applied'&&(!v.resultRevision||!v.applicationDigest))ctx.addIssue({code:'custom',message:'应用记录缺少保存确认'});});
export type EditProposal=z.infer<typeof proposalSchema>;
export const proposalActionSchema=z.object({proposalId:z.uuid()}).strict();
export const applyEditSchema=z.object({proposalId:z.uuid(),scene:sceneSchema}).strict();
export function createdElementId(proposalId:string,index:number){return `sketch-edit-${proposalId}-${index}`;}

/** Admission only; geometry/rendering is delegated to public Excalidraw APIs. */
export function validateOperations(scene:Drawing['scene'],operations:EditOperation[]){
 const live=new Map(scene.elements.filter(e=>!e.isDeleted).map(e=>[e.id,e]));
 for(const op of operations){
  if(op.op==='create')continue;
  const e=live.get(op.elementId);
  if(!e)throw new SketchError('ELEMENT_NOT_FOUND','目标不存在或已删除，请重新读取草图',409);
  const related=scene.elements.some(other=>!other.isDeleted&&(other.containerId===e.id||(other.startBinding as {elementId?:string}|null)?.elementId===e.id||(other.endBinding as {elementId?:string}|null)?.elementId===e.id));
  if(e.locked||e.containerId||e.boundElements?.length||e.startBinding||e.endBinding||e.groupIds?.length||related)throw new SketchError('UNSUPPORTED_EDIT','首版不修改锁定、绑定或分组元素，请手动调整',409);
  if(op.op==='resize'&&!['rectangle','ellipse','diamond'].includes(e.type))throw new SketchError('UNSUPPORTED_EDIT','首版仅调整独立矩形、椭圆和菱形尺寸，请手动调整其他图形',409);
  if(op.op==='delete')live.delete(e.id);
 }
}

/** A browser-produced scene may only contain the stored, explicitly proposed delta. */
export function validateEditScene(proposal:EditProposal,scene:Drawing['scene']){
 validateOperations(proposal.before,proposal.operations);
 const expected=new Map(proposal.before.elements.filter(e=>!e.isDeleted).map(e=>[e.id,structuredClone(e)]));
 const creates=new Map<string,Extract<EditOperation,{op:'create'}>>();
 proposal.operations.forEach((op,index)=>{
  if(op.op==='create'){creates.set(createdElementId(proposal.id,index),op);return;}
  if(op.op==='delete'){expected.delete(op.elementId);return;}
  Object.assign(expected.get(op.elementId)!,op.op==='move'?{x:op.x,y:op.y}:{width:op.width,height:op.height});
 });
 const ids=[...expected.keys(),...creates.keys()];
 if(canonical(scene.appState)!==canonical(proposal.before.appState)||canonical(scene.elements.map(e=>e.id))!==canonical(ids))throw new SketchError('INVALID_EDIT','修改结果包含未提议的场景变化');
 const volatile=new Set(['version','versionNonce','updated','index']);
 const stable=(e:unknown)=>Object.fromEntries(Object.entries(e as Record<string,unknown>).filter(([key])=>!volatile.has(key)));
 for(const e of scene.elements){
  const original=expected.get(e.id),op=creates.get(e.id);
  if(original){if(canonical(stable(original))!==canonical(stable(e)))throw new SketchError('INVALID_EDIT','修改结果包含未提议的元素变化');continue;}
  if(!op||e.isDeleted||e.type!==op.type||e.x!==op.x||e.y!==op.y||e.link||e.locked||e.containerId||e.startBinding||e.endBinding||e.boundElements?.length||e.groupIds?.length||e.customData)throw new SketchError('INVALID_EDIT','新增图形不符合受限提议');
  const style={angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100};
  if(Object.entries(style).some(([k,v])=>e[k]!==undefined&&e[k]!==v))throw new SketchError('INVALID_EDIT','新增图形包含未提议的样式');
  if(op.type==='text'){if(e.text!==op.text||e.originalText!==op.text||e.fontFamily!==1||e.fontSize!==20)throw new SketchError('INVALID_EDIT','新增文字不符合提议');}
  else if(e.width!==op.width||e.height!==op.height)throw new SketchError('INVALID_EDIT','新增尺寸不符合提议');
  // The public 0.18.1 converter can inset arrow endpoints by half a pixel.
  // Validate its bounded result rather than overriding native geometry.
  if(op.type==='arrow'){
   const points=e.points;
   if(!points||points.length!==2||Math.abs(points[0]![0])>1||Math.abs(points[0]![1])>1||Math.abs(points[1]![0]-op.width)>1||Math.abs(points[1]![1]-op.height)>1||e.endArrowhead!=='arrow'||e.startArrowhead!==null||e.elbowed)throw new SketchError('INVALID_EDIT','新增箭头不符合提议');
  }
  const allowed=new Set(['id','type','x','y','width','height','angle','strokeColor','backgroundColor','fillStyle','strokeWidth','strokeStyle','roughness','opacity','groupIds','frameId','roundness','seed','version','versionNonce','isDeleted','boundElements','updated','link','locked','index','text','originalText','containerId','fontSize','fontFamily','textAlign','verticalAlign','autoResize','lineHeight','points','lastCommittedPoint','startBinding','endBinding','startArrowhead','endArrowhead','elbowed','fixedSegments','startIsSpecial','endIsSpecial']);
  const extra=Object.keys(e).filter(k=>!allowed.has(k));if(extra.length)throw new SketchError('INVALID_EDIT',`新增图形包含非公开操作字段：${extra.join(', ')}`);
 }
}
