import {useEffect, useRef, useState, type MutableRefObject, type PointerEvent, type RefObject} from 'react';
import css from './SketchShell.module.css';

const min = 30;
const max = 60;

/** Keep split resizing local to the shell's CSS. The native composer and
 * editor frame need no new props as the pointer moves. */
export function PanelDivider({shell, preference}: {
 shell: RefObject<HTMLDivElement>;
 preference: MutableRefObject<number>;
}) {
 const [ratio, setRatio] = useState(preference.current);
 const drag = useRef<{id: number; start: number; latest: number; original: number} | null>(null);
 const frame = useRef<number | undefined>(undefined);

 const apply = (value: number) => {
  const next = Math.max(min, Math.min(max, value));
  shell.current?.style.setProperty('--sketch-chat-width', next + '%');
  preference.current = next;
  setRatio(next);
 };
 const update = () => {
  frame.current = undefined;
  const pointer = drag.current;
  const box = shell.current?.getBoundingClientRect();
  if (pointer && box?.width) apply(pointer.original + (pointer.latest - pointer.start) / box.width * 100);
 };
 const stopFrame = () => {
  if (frame.current !== undefined) cancelAnimationFrame(frame.current);
  frame.current = undefined;
 };
 useEffect(() => stopFrame, []);
 const cancel = (event: PointerEvent<HTMLDivElement>) => {
  const pointer = drag.current;
  if (!pointer || pointer.id !== event.pointerId) return;
  stopFrame();
  drag.current = null;
  apply(pointer.original);
 };

 return <div className={css.divider} role="separator" aria-label="调整聊天和画板宽度" aria-orientation="vertical"
  aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(ratio)} tabIndex={0}
  onKeyDown={event => {
   if (drag.current) return;
   const value = {ArrowLeft: ratio - 2, ArrowRight: ratio + 2, Home: min, End: max}[event.key];
   if (value === undefined) return;
   event.preventDefault();
   apply(value);
  }}
  onPointerDown={event => {
   if (!event.isPrimary || event.button !== 0 || drag.current) return;
   event.currentTarget.setPointerCapture(event.pointerId);
   drag.current = {id: event.pointerId, start: event.clientX, latest: event.clientX, original: ratio};
  }}
  onPointerMove={event => {
   const pointer = drag.current;
   if (!pointer || pointer.id !== event.pointerId) return;
   pointer.latest = event.clientX;
   frame.current ??= requestAnimationFrame(update);
  }}
  onPointerUp={event => {
   const pointer = drag.current;
   if (!pointer || pointer.id !== event.pointerId) return;
   stopFrame();
   pointer.latest = event.clientX;
   update();
   drag.current = null;
   event.currentTarget.releasePointerCapture(event.pointerId);
  }}
  onPointerCancel={cancel} onLostPointerCapture={cancel}
 />;
}
