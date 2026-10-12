import {z} from 'zod';
import {APPEARANCE_LIMITS} from './limits.ts';
export const appearanceTokens={
 background:'--dsw-alias-bg-base',surface:'--dsw-alias-bg-layer-1',text:'--dsw-alias-label-primary',muted:'--dsw-alias-label-secondary',
 border:'--dsw-alias-border-l3',accent:'--dsw-alias-brand-primary',blue:'--dsw-alias-link',hover:'--dsw-alias-interactive-bg-hover',primary:'--dsw-alias-button-primary-fill',primaryText:'--dsw-alias-label-primary-foreground',
} as const;
const cssValue=z.string().min(1).refine(v=>!/[;{}]|url\s*\(/i.test(v)),colorValue=cssValue.max(APPEARANCE_LIMITS.colorChars);
// alpha.2 appends its fallback font stack; the computed default is 296 chars.
// Bound fonts separately so that stack cannot discard an entire theme update.
export const appearanceSchema=z.object({theme:z.enum(['light','dark']),fontFamily:cssValue.max(APPEARANCE_LIMITS.fontFamilyChars),colors:z.object({background:colorValue,surface:colorValue,text:colorValue,muted:colorValue,border:colorValue,accent:colorValue,blue:colorValue,hover:colorValue,primary:colorValue,primaryText:colorValue}).partial().strict()}).strict();
export type Appearance=z.infer<typeof appearanceSchema>;
