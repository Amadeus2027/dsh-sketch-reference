import {z} from 'zod';
import {ownerSchema,anchorSchema,commentSchema,commentUpdateSchema,drawingSchema} from './contracts.ts';

/** Budgets are wire bytes, not estimates of model tokens. */
export const AGENT_LIMITS=Object.freeze({summaryBytes:8*1024,detailBytes:16*1024,maxElements:50,maxTextChars:240,maxComments:3,maxEventClients:32,maxMetrics:100});
export const AGENT_EVENTS='/sketch-reference-events/v1';
const text=(max:number)=>z.string().refine(v=>!!v.trim()&&!v.includes('\0')&&Array.from(v).length<=max);
export const agentReadSchema=z.object({mode:z.enum(['summary','elements']).default('summary'),revision:z.uuid().optional(),elementIds:z.array(z.string().min(1).max(256)).min(1).max(AGENT_LIMITS.maxElements).optional(),offset:z.number().int().min(0).max(2000).default(0)}).strict().superRefine((v,ctx)=>{
 if(v.elementIds&&(!v.revision||v.mode!=='elements'))ctx.addIssue({code:'custom',message:'按 ID 读取需要 elements 模式和读取摘要时的 revision'});
});
export const agentSuggestionSchema=z.object({title:text(60),reason:text(1000),anchor:anchorSchema.optional()}).strict();
export const agentAnnotateSchema=z.object({revision:z.uuid(),expectedBatchId:z.uuid().nullable(),summary:text(240),comments:z.array(agentSuggestionSchema).min(1).max(AGENT_LIMITS.maxComments)}).strict();
export type AgentRead=z.infer<typeof agentReadSchema>;
export type AgentAnnotate=z.infer<typeof agentAnnotateSchema>;
export const agentBatchSchema=z.object({
 id:z.uuid(),source:z.literal('agent'),owner:ownerSchema,analysisRevision:z.uuid(),contentDigest:z.string(),goal:drawingSchema.shape.goal,
 advice:z.object({summary:text(240),suggestions:z.array(agentSuggestionSchema).min(1).max(AGENT_LIMITS.maxComments)}).strict(),
 createdAt:z.iso.datetime(),commentRevision:z.uuid(),comments:z.array(commentSchema).min(1).max(AGENT_LIMITS.maxComments),commentMutation:commentUpdateSchema.optional(),
 toolCallKey:z.string().regex(/^[a-f0-9]{64}$/),toolInputDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((v,ctx)=>{
 if(v.comments.length!==v.advice.suggestions.length||new Set(v.comments.map(c=>c.id)).size!==v.comments.length||new Set(v.comments.map(c=>c.suggestionIndex)).size!==v.comments.length||v.comments.some(c=>c.suggestionIndex>=v.advice.suggestions.length))ctx.addIssue({code:'custom',message:'批注状态与内容不匹配'});
});
export type AgentBatch=z.infer<typeof agentBatchSchema>;
