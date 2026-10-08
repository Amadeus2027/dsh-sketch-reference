import {z} from 'zod';
export const appearanceTokens={
 background:'--dsw-alias-bg-base',surface:'--dsw-alias-bg-layer-1',text:'--dsw-alias-label-primary',muted:'--dsw-alias-label-secondary',
 border:'--dsw-alias-border-l3',accent:'--dsw-alias-brand-primary',hover:'--dsw-alias-interactive-bg-hover',primary:'--dsw-alias-button-primary-fill',primaryText:'--dsw-alias-label-primary-foreground',
} as const;
const cssValue=z.string().min(1).max(256).refine(v=>!/[;{}]|url\s*\(/i.test(v));
export const appearanceSchema=z.object({theme:z.enum(['light','dark']),fontFamily:cssValue,colors:z.object({background:cssValue,surface:cssValue,text:cssValue,muted:cssValue,border:cssValue,accent:cssValue,hover:cssValue,primary:cssValue,primaryText:cssValue}).partial().strict()}).strict();
export type Appearance=z.infer<typeof appearanceSchema>;
