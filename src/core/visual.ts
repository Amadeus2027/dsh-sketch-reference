import {z} from 'zod';
import {ownerSchema} from './contracts.ts';
import {focusSchema} from './agent.ts';
import {IMAGE_LIMITS} from './limits.ts';

export const VISUAL_LIMITS=Object.freeze({records:1000,metadataBytes:2*1024*1024});
export const imageRefSchema=z.object({attachmentId:z.string().min(1).max(256),mediaType:z.literal('image/png'),bytes:z.number().int().positive().max(IMAGE_LIMITS.maxBytes),width:z.number().int().positive().max(IMAGE_LIMITS.maxDimension),height:z.number().int().positive().max(IMAGE_LIMITS.maxDimension),name:z.string().max(200).optional(),originalDimensions:z.object({width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional()}).strict();
export const visualReadSchema=z.object({revision:z.uuid(),scope:z.enum(['all','focus']).default('all')}).strict();
export const visualPrepareSchema=visualReadSchema.extend({pngBase64:z.string().min(1).max(IMAGE_LIMITS.maxBase64Chars)}).strict();
export const visualRecordSchema=z.object({owner:ownerSchema,revision:z.uuid(),sceneDigest:z.string(),scope:z.enum(['all','focus']),elementIds:focusSchema.shape.elementIds,image:imageRefSchema,createdAt:z.iso.datetime()}).strict();
export type VisualRecord=z.infer<typeof visualRecordSchema>;
export const focusStateSchema=focusSchema.extend({stale:z.boolean()}).strict().nullable();
export const visualInfoSchema=z.object({revision:z.uuid(),stale:z.boolean(),width:z.number().int().positive(),height:z.number().int().positive()}).strict().nullable();
export const visualStateSchema=z.object({available:z.boolean(),all:visualInfoSchema,focus:visualInfoSchema,selection:focusStateSchema}).strict();
export type VisualState=z.infer<typeof visualStateSchema>;
