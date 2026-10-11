import type {KvTable} from '@deepseek-ai/dsh-storage-domain';

/** Cache serialization, not totals. KvTable values are immutable by contract.
 * Every admission still reads the current table, so deletes/replacements, failed
 * writes and restarts need no counter rollback or persisted format migration.
 * Callers retain their existing serialized write admission and capacity limits.
 */
export class RecordBytes<T extends object> {
 private sizes=new WeakMap<T,number>();
 private size(value:T){
  const known=this.sizes.get(value);if(known!==undefined)return known;
  const bytes=Buffer.byteLength(JSON.stringify(value));this.sizes.set(value,bytes);return bytes;
 }
 replacing(table:Pick<KvTable<string,T>,'entries'>,key:string,next:T){
  let bytes=this.size(next);
  for(const [k,value] of table.entries())if(k!==key)bytes+=this.size(value);
  return bytes;
 }
}
