import assert from 'node:assert/strict';
import test from 'node:test';

async function scenario(first:'success'|'error'|'blocked',run:(api:typeof import('../web/src/lib/plugins'),state:any)=>Promise<void>,saved:unknown={plugins:[],storage:{},viewId:null,themeId:null}){
 const original=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),state:any={opens:0,requests:[],databases:[],closed:0};
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{
  const attempt=++state.opens;let closed=false;
  const database:any={name:'dolphin-calendar-plugins',close:()=>{closed=true;state.closed++;},transaction:()=>{
   if(closed)throw new DOMException('数据库已关闭','InvalidStateError');let pending=0,aborted=false;
   const tx:any={abort:()=>{aborted=true;tx.onabort?.();},objectStore:()=>({get:(key:string)=>{
    pending++;const request:any={result:key==='app'?saved:0};queueMicrotask(()=>{request.onsuccess?.();if(--pending===0&&!aborted)tx.oncomplete?.();});return request;
   }})};return tx;
  }};
  const request:any={result:database};state.requests.push(request);state.databases.push(database);
  queueMicrotask(()=>{if(attempt===1&&first!=='success')request[first==='error'?'onerror':'onblocked']?.();else request.onsuccess?.();});return request;
 }}});
 try{const api=await import(new URL('../web/src/lib/plugins.ts?storage='+crypto.randomUUID(),import.meta.url).href);await run(api,state);}
 finally{if(original)Object.defineProperty(globalThis,'indexedDB',original);else delete (globalThis as any).indexedDB;}
}
test('插件数据库首次打开失败后可以重新读取，保留原插件配置',async()=>{
 await scenario('error',async(api,state)=>{await assert.rejects(api.loadPluginState(),/无法打开/);assert.deepEqual((await api.loadPluginState()).storage,{});assert.equal(state.opens,2);});
});
test('插件数据库被阻塞后，迟到的旧打开结果不会覆盖新连接',async()=>{
 await scenario('blocked',async(api,state)=>{await assert.rejects(api.loadPluginState(),/其他页面/);await api.loadPluginState();state.requests[0].onsuccess();await api.loadPluginState();assert.equal(state.opens,2);assert.equal(state.closed,1);});
});
test('插件数据库版本变化后释放旧连接并重新打开',async()=>{
 await scenario('success',async(api,state)=>{await api.loadPluginState();state.databases[0].onversionchange();await api.loadPluginState();assert.equal(state.opens,2);});
});
test('插件数据库异常关闭后重试不会一直复用已关闭连接',async()=>{
 await scenario('success',async(api,state)=>{await api.loadPluginState();state.databases[0].close();state.databases[0].onclose?.();await api.loadPluginState();assert.equal(state.opens,2);});
});
test('损坏的插件快照明确报错，不当作空插件列表继续覆盖',async()=>{
 await scenario('success',async api=>{await assert.rejects(api.loadPluginState(),/存储格式无效/);},{plugins:null,storage:{},viewId:null,themeId:null});
});
