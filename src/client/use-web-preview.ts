import {useCallback, useEffect, useRef, useState} from 'react';
import type {Owner} from '../core/contracts.ts';
import {loadWebDocument, type WebDocument} from './web-document.ts';
import type {WebFiles} from './web-files.ts';

type OnVerified = (page: WebDocument, signal: AbortSignal) => void | Promise<void>;

/** All reads (including final confirmation) share one cancellable flight.
 * If a file changes during a read, check the latest version once it settles. */
export function useWebPreview(owner: Owner, files: WebFiles, initialPath: string) {
 const [page, setPage] = useState<WebDocument | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const flight = useRef<AbortController | null>(null);
 const pendingChange = useRef(false);
 const firstPath = useRef(initialPath);

 const read = useCallback(async (path: string, verified?: OnVerified) => {
  if (flight.current) return;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
  flight.current = controller;
  setBusy(true);
  setError('');
  try {
   const next = await loadWebDocument(owner, path, files, signal);
   signal.throwIfAborted();
   setPage(previous => {
    if (!previous || previous.revision !== next.revision) return next;
    const changed = [...next.stamps].some(([file, stamp]) => previous.stamps.get(file) !== stamp);
    return changed ? next : previous;
   });
   await verified?.(next, signal);
  } catch (e) {
   if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '网页预览失败');
  } finally {
   if (flight.current === controller) {
    flight.current = null;
    setBusy(false);
   }
  }
 }, [owner, files]);

 useEffect(() => {
  void read(firstPath.current);
  return () => {
   flight.current?.abort();
   flight.current = null;
  };
 }, [read]);

 useEffect(() => {
  if (!page) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = files.watch(owner, page.stamps, () => {
   clearTimeout(timer);
   timer = setTimeout(() => {
    if (flight.current) pendingChange.current = true;
    else void read(page.path);
   }, 150);
  });
  return () => { off(); clearTimeout(timer); };
 }, [owner, page, files, read]);

 useEffect(() => {
  if (busy || !pendingChange.current || !page) return;
  pendingChange.current = false;
  void read(page.path);
 }, [busy, page, read]);

 return {page, busy, error, setError, read};
}
