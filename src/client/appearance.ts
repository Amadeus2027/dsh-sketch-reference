import type {Context} from '@deepseek-ai/cordis';
import {appearanceTokens,appearanceSchema,type Appearance} from '../core/appearance.ts';
/** Public theme service/event, optional when the host runs without ui-theme. */
interface ThemeService {getTheme():{active:{colorScheme:'light'|'dark'}}}
export function createHostAppearance(ctx:Context){
 const media=matchMedia('(prefers-color-scheme: dark)');
 let native=false,snapshot:Appearance={theme:media.matches?'dark':'light',fontFamily:'system-ui, sans-serif',colors:{}};
 const listeners=new Set<()=>void>();
 const refresh=(theme=snapshot.theme)=>{
  const style=getComputedStyle(document.body),colors=Object.fromEntries(Object.entries(appearanceTokens).map(([key,token])=>[key,style.getPropertyValue(token).trim()]).filter(([,value])=>value));
  const parsed=appearanceSchema.safeParse({theme,fontFamily:style.fontFamily||'system-ui, sans-serif',colors});
  if(parsed.success&&JSON.stringify(snapshot)!==JSON.stringify(parsed.data)){snapshot=parsed.data;for(const listener of listeners)listener();}
 };
 refresh();
 const fallback=()=>{if(!native)refresh(media.matches?'dark':'light');};media.addEventListener('change',fallback);
 ctx.effect(()=>()=>{media.removeEventListener('change',fallback);listeners.clear();});
 ctx.inject(['theme'],scope=>{
  native=true;const theme=scope.get('theme') as ThemeService;
  refresh(theme.getTheme().active.colorScheme);
  // Guarded type adapter for the public optional theme event; no feature runtime import.
  const events=scope as Context&{on(event:'theme/change',listener:()=>void):()=>void};
  events.on('theme/change',()=>refresh(theme.getTheme().active.colorScheme));
  scope.effect(()=>()=>{native=false;fallback();});
 });
 return {getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
