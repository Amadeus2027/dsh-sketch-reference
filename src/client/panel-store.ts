const open=new Set<string>();const listeners=new Set<()=>void>();
export const panelStore={
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 isOpen(id:string){return open.has(id);},
 set(id:string,value:boolean){if(value)open.add(id);else open.delete(id);for(const listener of listeners)listener();},
 clear(){open.clear();listeners.clear();}
};
