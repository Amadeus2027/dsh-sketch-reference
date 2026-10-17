import {z} from 'zod';
import {ownerSchema,type Owner,type Drawing,SketchError} from './contracts.ts';

export const nodeIdSchema=z.union([z.literal('root'),z.uuid()]);
const coordinate=z.number().finite().min(-100000).max(100000);
const label=z.string().trim().min(1).max(120).refine(v=>!v.includes('\0'));
export const regionSchema=z.object({x:coordinate,y:coordinate,width:z.number().positive().max(200000),height:z.number().positive().max(200000)}).strict();
export const graphAnchorSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('node')}).strict(),
 z.object({kind:z.literal('elements'),elementIds:z.array(z.string().min(1).max(256)).min(1).max(50).refine(ids=>new Set(ids).size===ids.length)}).strict(),
 z.object({kind:z.literal('region'),region:regionSchema}).strict(),
]);
export type GraphAnchor=z.infer<typeof graphAnchorSchema>;
export const graphNodeSchema=z.object({id:nodeIdSchema,name:label,kind:z.enum(['page','detail','unclassified']),position:z.object({x:coordinate,y:coordinate}).strict()}).strict();
export const graphEdgeSchema=z.object({id:z.uuid(),sourceNodeId:nodeIdSchema,targetNodeId:nodeIdSchema,type:z.enum(['navigation','detail']),anchor:graphAnchorSchema,label:z.string().max(200)}).strict();
export const graphContentSchema=z.object({nodes:z.array(graphNodeSchema).min(1).max(100),edges:z.array(graphEdgeSchema).max(300),viewport:z.object({x:coordinate,y:coordinate,zoom:z.number().min(.1).max(4)}).strict()}).strict().superRefine((g,ctx)=>{
 const ids=new Set(g.nodes.map(n=>n.id));
 if(ids.size!==g.nodes.length||!ids.has('root'))ctx.addIssue({code:'custom',message:'图必须包含唯一根节点，节点 ID 不得重复'});
 if(new Set(g.edges.map(e=>e.id)).size!==g.edges.length)ctx.addIssue({code:'custom',message:'连线 ID 不得重复'});
 const parents=new Map<string,string>();
 for(const edge of g.edges){
  if(!ids.has(edge.sourceNodeId)||!ids.has(edge.targetNodeId))ctx.addIssue({code:'custom',message:'连线节点不存在'});
  if(edge.type!=='detail')continue;
  if(edge.targetNodeId==='root'||parents.has(edge.targetNodeId))ctx.addIssue({code:'custom',message:'根节点不能是细节，细节节点只能有一个父节点'});
  parents.set(edge.targetNodeId,edge.sourceNodeId);
 }
 for(const id of ids){const visited=new Set<string>();let next:string|undefined=id;while(next){if(visited.has(next)){ctx.addIssue({code:'custom',message:'细节展开不能形成循环'});break;}visited.add(next);next=parents.get(next);}}
});
export const graphSchema=z.object({formatVersion:z.literal(1),owner:ownerSchema,revision:z.uuid(),mutationId:z.uuid(),updatedAt:z.iso.datetime(),content:graphContentSchema}).strict();
export type SketchGraph=z.infer<typeof graphSchema>;
export type GraphContent=z.infer<typeof graphContentSchema>;
export type GraphNode=z.infer<typeof graphNodeSchema>;
export type GraphEdge=z.infer<typeof graphEdgeSchema>;
export const graphDocumentRevisionsSchema=z.array(z.object({nodeId:nodeIdSchema,revision:z.uuid().nullable()}).strict()).max(100).refine(rows=>new Set(rows.map(r=>r.nodeId)).size===rows.length);
export const graphSaveSchema=z.object({expectedRevision:z.uuid().nullable(),mutationId:z.uuid(),content:graphContentSchema}).strict();
export const graphReadSchema=z.object({offset:z.number().int().min(0).max(400).default(0),revision:z.uuid().optional()}).strict();
export function initialGraph():GraphContent{return {nodes:[{id:'root',name:'首页',kind:'page',position:{x:0,y:0}}],edges:[],viewport:{x:80,y:80,zoom:1}};}
export function documentOwner(owner:Owner,nodeId:string):Owner {return nodeId==='root'?{sessionId:owner.sessionId,createdAt:owner.createdAt,cwd:owner.cwd}:{sessionId:owner.sessionId,createdAt:owner.createdAt,cwd:owner.cwd,nodeId:nodeIdSchema.parse(nodeId)};}
export function requireNode(graph:SketchGraph|null,nodeId:string){if(nodeId!=='root'&&!graph?.content.nodes.some(n=>n.id===nodeId))throw new SketchError('NODE_NOT_FOUND','草图节点不存在或已删除',404);}
export function anchorStatus(anchor:GraphAnchor,drawing:Drawing|null):'valid'|'missing' {
 if(anchor.kind!=='elements')return 'valid';
 const ids=new Set(drawing?.scene.elements.filter(e=>!e.isDeleted).map(e=>e.id));return anchor.elementIds.every(id=>ids.has(id))?'valid':'missing';
}
export function detailPath(content:GraphContent,nodeId:string):GraphNode[]{const result:GraphNode[]=[];let id:string|undefined=nodeId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const node=content.nodes.find(n=>n.id===id);if(node)result.unshift(node);id=content.edges.find(e=>e.type==='detail'&&e.targetNodeId===id)?.sourceNodeId;}return result;}
