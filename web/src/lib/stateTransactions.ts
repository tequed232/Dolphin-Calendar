/** App and plugin snapshots share transaction semantics, but retain separate databases. */
const revisions=new WeakMap<object,{db:IDBDatabase;version:number}>();
const channels=new Map<string,BroadcastChannel>();
const validRevision=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function revision(value:unknown){if(value===undefined)return 0;if(!validRevision(value))throw new Error('本地事务版本无效，请保留数据并重新打开应用');return value;}
function channel(name:string){
 if(typeof window==='undefined'||!window.BroadcastChannel)return;
 try{let bus=channels.get(name);if(!bus){bus=new BroadcastChannel(name+'-changes');channels.set(name,bus);}return bus;}catch{return;}
}
function mark<T extends object>(value:T,db:IDBDatabase,version:number){revisions.set(value,{db,version});return value;}
function cached<T extends object>(value:T|undefined,db:IDBDatabase,version:number):value is T{
 const tag=value&&revisions.get(value);return version>0&&tag?.db===db&&tag.version===version;
}
export function readState<T extends object>(db:IDBDatabase,decode:(raw:unknown)=>T,current?:T):Promise<T>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readonly'),store=tx.objectStore('state'),version=store.get('appRevision');let result:T;
  const fail=(error:unknown)=>{reject(error);tx.abort();};
  version.onsuccess=()=>{try{
   const value=revision(version.result);
   if(cached(current,db,value)){result=current;return;}
   const request=store.get('app');request.onsuccess=()=>{try{const decoded=mark(decode(request.result),db,value);result=current?reuseState(current,decoded):decoded;}catch(error){fail(error);}};
  }catch(error){fail(error);}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error??new Error('本地数据读取被中断'));
 });
}
export function commitState<T extends object>(db:IDBDatabase,current:T|undefined,change:(previous:T)=>T,decode:(raw:unknown)=>T,validate?:(value:T)=>T,force=false):Promise<T>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),version=store.get('appRevision');let next:T,nextVersion=0,wrote=false;
  const fail=(error:unknown)=>{reject(error);tx.abort();};
  const apply=(previous:T)=>{try{
   next=change(previous);
   if(!force&&next===previous)return;
   const checked=validate?validate(next):next;
   if(nextVersion===Number.MAX_SAFE_INTEGER)throw new Error('本地事务版本已达上限，请先导出数据');
   store.put(checked,'app');store.put(++nextVersion,'appRevision');wrote=true;
  }catch(error){fail(error);}};
  version.onsuccess=()=>{try{
   nextVersion=revision(version.result);
   // Reuse only a committed snapshot from this open connection. Legacy or reopened data is read again.
   if(cached(current,db,nextVersion)){apply(current);return;}
   if(force){apply(decode(undefined));return;}
   const request=store.get('app');request.onsuccess=()=>{try{const decoded=mark(decode(request.result),db,nextVersion);apply(current?reuseState(current,decoded):decoded);}catch(error){fail(error);}};
  }catch(error){fail(error);}};
  tx.oncomplete=()=>{mark(next,db,nextVersion);if(wrote)try{channel(db.name)?.postMessage({type:'committed',revision:nextVersion});}catch{/* Synchronization must not turn a committed save into a failure. */}resolve(next);};
  tx.onerror=tx.onabort=()=>reject(tx.error??new Error('保存被中断'));
 });
}
export async function replaceState<T extends object>(db:IDBDatabase,value:T,validate?:(value:T)=>T){await commitState(db,undefined,()=>value,()=>value,validate,true);}
export function onStateChange(name:string,changed:()=>void){
 const bus=channel(name),receive=(event:MessageEvent)=>{if(event.data?.type==='committed'&&validRevision(event.data.revision)&&event.data.revision>0)changed();};
 bus?.addEventListener('message',receive);window.addEventListener('focus',changed);
 return()=>{bus?.removeEventListener('message',receive);window.removeEventListener('focus',changed);};
}
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&same(left[key],right[key]));
}
/** Preserve unchanged references so another window's preference edit does not rebuild the timetable. */
export function reuseState<T extends object>(previous:T,incoming:T):T{
 const next={...incoming};let identical=Object.keys(previous).length===Object.keys(incoming).length;
 for(const key of Object.keys(incoming) as (keyof T)[]){if(same(previous[key],incoming[key]))next[key]=previous[key];else identical=false;}
 const result=identical?previous:next,tag=revisions.get(incoming);
 if(tag)revisions.set(result,tag);else revisions.delete(result);
 return result;
}
