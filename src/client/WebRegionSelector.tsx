import {useRef, useState, type PointerEvent} from 'react';
import css from './WebReview.module.css';

type Point = {x: number; y: number};
export type Region = {x: number; y: number; w: number; h: number};

function point(event: PointerEvent<SVGSVGElement>): Point {
 const bounds = event.currentTarget.getBoundingClientRect();
 return {
  x: Math.round(Math.max(0, Math.min(bounds.width - 1, event.clientX - bounds.left))),
  y: Math.round(Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top))),
 };
}
function between(a: Point, b: Point): Region {
 return {x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(b.x-a.x), h: Math.abs(b.y-a.y)};
}

/** Pointer movement only redraws the overlay. Commit once on release. */
export function WebRegionSelector({saved, disabled, onSelect}: {
 saved: Region | null;
 disabled: boolean;
 onSelect: (region: Region, pointerType: string) => void;
}) {
 const gesture = useRef<{id: number; start: Point} | null>(null);
 const [draft, setDraft] = useState<Region | null>(null);
 const cancel = () => { gesture.current = null; setDraft(null); };
 const shape = draft ?? saved;
 return <svg className={css.webOverlay} aria-label="在网页上拖动圈选"
  onPointerDown={event => {
   if (disabled || !event.isPrimary || event.button !== 0) return;
   event.currentTarget.setPointerCapture(event.pointerId);
   const start = point(event);
   gesture.current = {id: event.pointerId, start};
   setDraft(between(start,start));
  }}
  onPointerMove={event => {
   if (gesture.current?.id === event.pointerId) setDraft(between(gesture.current.start,point(event)));
  }}
  onPointerUp={event => {
   if (gesture.current?.id !== event.pointerId) return;
   const region = between(gesture.current.start,point(event));
   cancel();
   if (!disabled) onSelect(region,event.pointerType);
  }}
  onLostPointerCapture={cancel} onPointerCancel={cancel}>
  {shape && <ellipse cx={shape.x+shape.w/2} cy={shape.y+shape.h/2} rx={shape.w/2} ry={shape.h/2}/>}
 </svg>;
}
