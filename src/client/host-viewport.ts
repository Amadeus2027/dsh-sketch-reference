const leases=new WeakMap<HTMLElement,{count:number;value:string;priority:string}>();

/** Pinned DSH layout adapter. Collapsed side columns still have wide content.
 * overflow:hidden allows focus/scrollIntoView to scroll the whole host grid,
 * taking our board out of the viewport. clip keeps inner chat/canvas scrolling
 * intact without a scrollLeft reset loop or hard-coded host CSS class names. */
export function clipHostViewport(shell:HTMLElement):()=>void {
 let frame=shell.parentElement;
 while(frame&&getComputedStyle(frame).display!=='grid')frame=frame.parentElement;
 if(!frame||frame.children.length<4||!frame.children[1]?.contains(shell)||getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/).length!==3)return()=>{};
 const target=frame,existing=leases.get(target);
 if(existing)existing.count++;
 else{
  leases.set(target,{count:1,value:target.style.getPropertyValue('overflow'),priority:target.style.getPropertyPriority('overflow')});
  target.style.setProperty('overflow','clip');
 }
 return()=>{
  const lease=leases.get(target);if(!lease||--lease.count)return;
  leases.delete(target);
  if(target.style.getPropertyValue('overflow')!=='clip')return;
  if(lease.value)target.style.setProperty('overflow',lease.value,lease.priority);else target.style.removeProperty('overflow');
 };
}
