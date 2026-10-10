import { z } from 'zod';
import { ownerSchema,MAX_PNG } from './contracts.ts';
import {commentRequestSchema} from './comment-context.ts';
export const bridgeMessage=z.discriminatedUnion('type',[
 z.object({type:z.literal('STAGE_IMAGE'),id:z.uuid(),owner:ownerSchema,bytes:z.instanceof(ArrayBuffer).refine(v=>v.byteLength<=MAX_PNG),digest:z.string().max(100)}).strict(),
 z.object({type:z.literal('INSERT_ADVICE'),id:z.uuid(),owner:ownerSchema,batchId:z.uuid(),index:z.number().int().min(0).max(2)}).strict(),
 z.object({type:z.literal('INSERT_COMMENT'),id:z.uuid(),owner:ownerSchema,request:commentRequestSchema}).strict(),
 z.object({type:z.literal('CLOSE'),id:z.uuid()}).strict()
]);
export const bridgeResult=z.object({type:z.literal('RESULT'),id:z.uuid(),ok:z.boolean(),message:z.string().max(1000)}).strict();
