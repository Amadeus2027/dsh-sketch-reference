type Element = Readonly<{id: string; version?: number; versionNonce?: number; isDeleted?: boolean}>;
type Snapshot = {elements: readonly Element[]; state: Record<string, unknown>};
const gridKeys = ['gridSize', 'gridStep', 'gridModeEnabled'] as const;

/** Compare viewport-only notifications without allocating per-element signatures. Some tools mutate an element
 * in place, so identity alone cannot distinguish a pan from a real edit. */
export class SceneUpdates {
 private grid: Record<string, unknown> | null = null;
 private stamps: {element: Element; id: string; version: number | undefined; versionNonce: number | undefined; isDeleted: boolean | undefined}[] = [];
 private pending: Snapshot | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private closed = false;

 constructor(private apply: (elements: readonly Element[], state: Record<string, unknown>) => void) {}

 accept(elements: readonly Element[], state: Record<string, unknown>): boolean {
  if (this.closed) return false;
  const draft = state.newElement ?? state.multiElement;
  if (draft && typeof draft === 'object' && 'type' in draft && (draft.type === 'line' || draft.type === 'arrow') &&
      'points' in draft && Array.isArray(draft.points) && draft.points.length < 2) return false;

  let changed = elements.length !== this.stamps.length;
  for (let i = 0; i < elements.length; i++) {
   const element = elements[i]!;
   const stamp = this.stamps[i];
   if (stamp && element === stamp.element && element.id === stamp.id &&
       element.version === stamp.version && element.versionNonce === stamp.versionNonce && element.isDeleted === stamp.isDeleted) continue;
   const {id, version, versionNonce, isDeleted} = element;
   this.stamps[i] = {element, id, version, versionNonce, isDeleted};
   changed = true;
  }
  this.stamps.length = elements.length;
  if (!this.grid || gridKeys.some(key => this.grid![key] !== state[key])) {
   const grid: Record<string, unknown> = {};
   for (const key of gridKeys) if (state[key] !== undefined) grid[key] = state[key];
   this.grid = grid;
   changed = true;
  }
  if (!changed) return false;
  this.pending = {elements: elements.slice(), state: this.grid};
  this.timer ??= setTimeout(() => this.flush(), 80);
  return true;
 }

 flush() {
  clearTimeout(this.timer);
  this.timer = undefined;
  const pending = this.pending;
  this.pending = null;
  if (pending) this.apply(pending.elements, pending.state);
 }

 dispose() {
  this.flush();
  this.closed = true;
  this.grid = null;
  this.stamps = [];
 }
}
