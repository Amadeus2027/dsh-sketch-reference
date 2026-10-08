import { z } from 'zod';
import {IMAGE_LIMITS} from './limits.ts';
import { createSceneSchema, scenePolicy } from './scene.ts';
export const ASSETS = '/sketch-reference-assets';
export const RPC = '/sketch-reference-rpc/v1';
export const MAX_PNG = IMAGE_LIMITS.maxBytes;
export const sceneSchema = createSceneSchema(scenePolicy);
const text = (max: number) => z.string().refine(v => Array.from(v).length <= max && !v.includes('\0'));
export const ownerSchema = z.object({sessionId: z.string().min(1).max(200), createdAt: z.string().min(1).max(100), cwd: z.string().max(4096)}).strict();
export type Owner = z.infer<typeof ownerSchema>;
export const routeSchema = z.object({provider: z.enum(['deepseek-official','deepseek-account']), model: z.literal('deepseek-flash')}).strict();
export type Route = z.infer<typeof routeSchema>;
export const adviceSchema = z.object({summary: text(120).refine(v => !!v.trim()), suggestions: z.array(z.object({kind:z.enum(['clarify','improve','create']),title:text(24).refine(v => !!v.trim()),reason:text(100).refine(v => !!v.trim()),actionPrompt:text(500).refine(v => !!v.trim())}).strict()).min(1).max(3)}).strict();
export type Advice = z.infer<typeof adviceSchema>;
export const batchSchema = z.object({id:z.uuid(),owner:ownerSchema,contentDigest:z.string(),goal:text(2000),route:routeSchema,advice:adviceSchema,createdAt:z.string()}).strict();
export type Batch = z.infer<typeof batchSchema>;
export const drawingSchema = z.object({formatVersion:z.literal(1),owner:ownerSchema,revision:z.uuid(),mutationId:z.uuid(),sceneDigest:z.string(),contentDigest:z.string(),scene:sceneSchema,goal:text(2000),updatedAt:z.string()}).strict();
export type Drawing = z.infer<typeof drawingSchema>;
export const envelopeSchema = z.object({protocolVersion:z.literal(1),requestId:z.uuid(),owner:ownerSchema.nullable(),payload:z.unknown()}).strict();
export const saveSchema = z.object({expectedRevision:z.uuid().nullable(),mutationId:z.uuid(),scene:sceneSchema,goal:text(2000)}).strict();
export type Save = z.infer<typeof saveSchema>;
export const generateSchema = z.object({revision:z.uuid(),pngBase64:z.string().max(IMAGE_LIMITS.maxBase64Chars),route:routeSchema}).strict();
export const modelSchema = routeSchema;
export const loadSchema = z.object({owner:ownerSchema,drawing:drawingSchema.nullable(),latestAdvice:batchSchema.nullable(),routes:z.array(routeSchema)}).strict();
export const resultSchema = z.discriminatedUnion('ok',[
 z.object({ok:z.literal(true),requestId:z.uuid(),value:z.unknown()}).strict(),
 z.object({ok:z.literal(false),requestId:z.string(),error:z.object({code:z.string(),message:z.string()}).strict()}).strict()
]);
export class SketchError extends Error {
 constructor(public code:string, message:string, public status=400) {super(message);}
}
export function ownerKey(owner:Owner):string {return JSON.stringify([owner.sessionId,owner.createdAt,owner.cwd]);}
export function sameOwner(a:Owner,b:Owner):boolean {return ownerKey(a)===ownerKey(b);}
export function canonical(value: unknown): string {
 if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 if (value !== null && typeof value === 'object') {
  const record=value as Record<string,unknown>;
  return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonical(record[k])).join(',')+'}';
 }
 return JSON.stringify(value) ?? 'null';
}
export async function digest(value:unknown):Promise<string> {
 const bytes = new TextEncoder().encode(canonical(value));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function contentDigest(scene: Drawing['scene']):Promise<string> {
 const ignored=new Set(['version','versionNonce','updated','seed','isDeleted']);
 return digest({elements:scene.elements.filter(e=>!e.isDeleted).map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>!ignored.has(k)))),appState:scene.appState});
}
