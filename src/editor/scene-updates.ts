type Element=Readonly<{id:string;version?:number;versionNonce?:number;isDeleted?:boolean}>;
/** Excalidraw publishes immutable elements; viewport-only callbacks keep their identities.
 * Coalesce real edits for at most 80ms. Explicit actions and teardown synchronously flush.
 */
export class SceneUpdates {
 private previous:readonly Element[]=[];
 private versions:Array<string>=[];
 private state='';
 private pending:{elements:readonly Element[];state:Record<string,unknown>}|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private closed=false;
 constructor(private apply:(elements:readonly Element[],state:Record<string,unknown>)=>void){}
 accept(elements:readonly Element[],state:Record<string,unknown>):boolean {
  if(this.closed)return false;
  const retained=Object.fromEntries(['gridSize','gridStep','gridModeEnabled'].filter(k=>state[k]!==undefined).map(k=>[k,state[k]])),signature=JSON.stringify(retained);
  const versions=elements.map(e=>`${e.id}:${e.version}:${e.versionNonce}:${e.isDeleted}`);
  if(signature===this.state&&elements.length===this.previous.length&&elements.every((e,i)=>e===this.previous[i]&&versions[i]===this.versions[i]))return false;
  this.previous=elements.slice();this.versions=versions;this.state=signature;this.pending={elements:this.previous,state:retained};
  this.timer??=setTimeout(()=>this.flush(),80);return true;
 }
 flush(){clearTimeout(this.timer);this.timer=undefined;const pending=this.pending;this.pending=null;if(pending)this.apply(pending.elements,pending.state);}
 dispose(){this.flush();this.closed=true;this.previous=[];this.versions=[];}
}
