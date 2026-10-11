import {z} from 'zod';
import {IMAGE_LIMITS} from './limits.ts';

/** Durable native PNG metadata only, never paths, URLs or encoded pixels. */
export const imageRefSchema=z.object({attachmentId:z.string().min(1).max(256),mediaType:z.literal('image/png'),bytes:z.number().int().positive().max(IMAGE_LIMITS.maxBytes),width:z.number().int().positive().max(IMAGE_LIMITS.maxDimension),height:z.number().int().positive().max(IMAGE_LIMITS.maxDimension),name:z.string().max(200).optional(),originalDimensions:z.object({width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional()}).strict();
