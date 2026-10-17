import {APP_VERSION} from '../meta';
import type {Schedule} from './model';
import {readState,commitState,replaceState,onStateChange} from './stateTransactions';

export const PLUGIN_PERMISSIONS=['schedule:read','navigation:date','course:open','storage:local','schedule:import','theme:app'] as const;
export type PluginPermission=typeof PLUGIN_PERMISSIONS[number];
export const PLUGIN_THEME_TOKENS=['--canvas','--surface','--input','--ink','--muted','--accent','--on-accent','--accent-soft','--soft','--line','--line-strong','--danger',...['sage','lavender','peach','blue','rose'].flatMap(color=>[`--${color}`,`--${color}-ink`,`--${color}-line`])];
export const MAX_PLUGIN_PACKAGE_BYTES=2*1024*1024;
export const MAX_PLUGIN_DATA_BYTES=256*1024;
export const MAX_PLUGIN_IMPORT_BYTES=3*1024*1024;
export type PluginPackage={manifest:{id:string;name:string;version:string;apiVersion:1;minAppVersion?:string;author?:string;description?:string;permissions:PluginPermission[];contributes?:{view?:boolean;theme?:{light?:Record<string,string>;dark?:Record<string,string>}}};html:string;css?:string;javascript?:string};
export type InstalledPlugin=PluginPackage&{enabled:boolean};
export type PluginState={plugins:InstalledPlugin[];viewId:string|null;themeId:string|null;storage:Record<string,unknown>};
export type PluginContext={date:string;mode:'light'|'dark';tokens:Record<string,string>;schedule?:Schedule};
export function emptyPluginState():PluginState{return {plugins:[],viewId:null,themeId:null,storage:{}};}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function jsonBytes(value:unknown){const text=JSON.stringify(value);if(text===undefined)throw new Error('数据必须为 JSON 值');return new TextEncoder().encode(text).length;}
const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const plainText=(value:unknown,max:number,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
export function validPluginDate(value:unknown):value is string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<1900)return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function parsePluginPackage(text:string,appVersion=APP_VERSION):PluginPackage{
 if(new TextEncoder().encode(text).length>MAX_PLUGIN_PACKAGE_BYTES)throw new Error('插件包不能超过 2 MiB');
 let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('插件包必须是有效的 JSON 文件');}
 if(!object(value)||!object(value.manifest))throw new Error('缺少插件 manifest');
 const m=value.manifest;
 if(!plainText(m.id,80,true)||!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(m.id as string))throw new Error('插件 id 应为小写命名空间，例如 org.example.calendar');
 if(!plainText(m.name,80,true)||!plainText(m.version,32,true)||!versionPattern.test(m.version as string))throw new Error('插件名称或版本无效（版本使用 x.y.z）');
 if(m.apiVersion!==1)throw new Error('此插件 API 版本尚不受支持');
 if(m.minAppVersion!==undefined){if(!plainText(m.minAppVersion,32)||!versionPattern.test(m.minAppVersion as string)||!versionPattern.test(appVersion))throw new Error('minAppVersion 或应用版本格式无效');const required=(m.minAppVersion as string).split('.').map(BigInt),actual=appVersion.split('.').map(BigInt);for(let i=0;i<3;i++){if(actual[i]>required[i])break;if(actual[i]<required[i])throw new Error('请先升级应用至 '+m.minAppVersion);}}
 for(const key of ['author','description'])if(m[key]!==undefined&&!plainText(m[key],key==='author'?120:1200))throw new Error(key+' 字段过长或无效');
 if(!Array.isArray(m.permissions)||m.permissions.some(p=>typeof p!=='string'||!PLUGIN_PERMISSIONS.includes(p as PluginPermission))||new Set(m.permissions).size!==m.permissions.length)throw new Error('插件权限列表包含未知或重复权限');
 if(!plainText(value.html,MAX_PLUGIN_PACKAGE_BYTES)||value.css!==undefined&&!plainText(value.css,MAX_PLUGIN_PACKAGE_BYTES)||value.javascript!==undefined&&!plainText(value.javascript,MAX_PLUGIN_PACKAGE_BYTES))throw new Error('html、css、javascript 必须是字符串');
 if(m.contributes!==undefined){if(!object(m.contributes)||Object.keys(m.contributes).some(key=>!['view','theme'].includes(key)))throw new Error('contributes 格式无效');if(m.contributes.view!==undefined&&typeof m.contributes.view!=='boolean')throw new Error('view 必须为布尔值');if(m.contributes.theme!==undefined){if(!m.permissions.includes('theme:app')||!object(m.contributes.theme)||Object.keys(m.contributes.theme).some(key=>!['light','dark'].includes(key)))throw new Error('主题需要 theme:app 权限与 light/dark 配色');for(const colors of Object.values(m.contributes.theme)){if(!object(colors)||Object.entries(colors).some(([key,color])=>!PLUGIN_THEME_TOKENS.includes(key)||typeof color!=='string'||!/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(color)))throw new Error('主题只允许已公开颜色变量及十六进制颜色');}}}
 // Reconstruct the public shape: unknown root fields cannot enter state or a host API.
 return {manifest:{id:m.id as string,name:m.name as string,version:m.version as string,apiVersion:1,...(m.minAppVersion!==undefined?{minAppVersion:m.minAppVersion as string}:{}),...(m.author!==undefined?{author:m.author as string}:{}),...(m.description!==undefined?{description:m.description as string}:{}),permissions:m.permissions as PluginPermission[],...(m.contributes!==undefined?{contributes:m.contributes as PluginPackage['manifest']['contributes']}:{})},html:value.html as string,...(value.css!==undefined?{css:value.css as string}:{}),...(value.javascript!==undefined?{javascript:value.javascript as string}:{})};
}
export function validatePluginData(value:unknown){if(jsonBytes(value)>MAX_PLUGIN_DATA_BYTES)throw new Error('插件配置不能超过 256 KiB');return JSON.parse(JSON.stringify(value)) as unknown;}
function validateState(value:unknown):PluginState{
 if(!object(value)||!Array.isArray(value.plugins)||value.plugins.length>20||!object(value.storage))throw new Error('插件存储格式无效');
 if(jsonBytes(value)>12*1024*1024)throw new Error('插件存储总量不能超过 12 MiB');
 const plugins=value.plugins.map(item=>{if(!object(item)||typeof item.enabled!=='boolean')throw new Error('插件启用状态无效');return {...parsePluginPackage(JSON.stringify(item)),enabled:item.enabled};});
 if(new Set(plugins.map(p=>p.manifest.id)).size!==plugins.length)throw new Error('插件 id 重复');
 for(const [id,data] of Object.entries(value.storage)){if(!plugins.some(p=>p.manifest.id===id))throw new Error('存在未安装插件的配置');validatePluginData(data);}
 const selection=(key:'viewId'|'themeId')=>{const id=value[key];if(id===null)return null;if(typeof id!=='string'||!plugins.some(p=>p.enabled&&p.manifest.id===id&&(key==='viewId'?p.manifest.contributes?.view:p.manifest.contributes?.theme)))throw new Error('已选插件不可用');return id;};
 return {plugins,viewId:selection('viewId'),themeId:selection('themeId'),storage:JSON.parse(JSON.stringify(value.storage))};
}
let opening:Promise<IDBDatabase>|undefined;
function database(){
 if(opening)return opening;
 const attempt=new Promise<IDBDatabase>((resolve,reject)=>{
  let settled=false;const request=indexedDB.open('dolphin-calendar-plugins',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('state');
  request.onerror=()=>{settled=true;reject(new Error('无法打开插件存储'));};
  request.onblocked=()=>{settled=true;reject(new Error('插件存储被其他页面占用，请关闭旧页面后重试'));};
  request.onsuccess=()=>{
   const db=request.result;if(settled){db.close();return;}settled=true;
   const release=()=>{if(opening===attempt)opening=undefined;};
   db.onversionchange=()=>{db.close();release();};db.onclose=release;resolve(db);
  };
 });
 opening=attempt;void attempt.catch(()=>{if(opening===attempt)opening=undefined;});return attempt;
}
const restorePluginState=(raw:unknown)=>raw===undefined?emptyPluginState():validateState(raw);
export async function loadPluginState(current?:PluginState):Promise<PluginState>{return readState(await database(),restorePluginState,current);}
export async function savePluginState(state:PluginState):Promise<void>{await replaceState(await database(),state,validateState);}
export async function commitPluginState(change:(previous:PluginState)=>PluginState,current?:PluginState){return commitState(await database(),current,change,restorePluginState,validateState);}
export const onPluginStateChange=(changed:()=>void)=>onStateChange('dolphin-calendar-plugins',changed);
export const PLUGIN_PROTOCOL='dolphin-plugin-v1';
export function createPluginSession(){return [...crypto.getRandomValues(new Uint8Array(24))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
// All script payloads are JSON strings, so HTML end-tags cannot escape the SDK script.
const scriptJSON=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function buildPluginDocument(pkg:PluginPackage,session:string){
 const sdk=`(()=>{const session=${scriptJSON(session)},protocol=${scriptJSON(PLUGIN_PROTOCOL)};let active=true,seq=0,context;const pending=new Map(),listeners=new Set();const ready=new Promise((resolve,reject)=>{pending.set('ready',{resolve,reject});});function request(method,args){return ready.then(()=>new Promise((resolve,reject)=>{if(!active){reject(new Error('插件已停止'));return;}const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(new Error('接口请求超时'));},15000);pending.set(id,{resolve,reject,timer});parent.postMessage({protocol,session,id,method,args},'*');}));}function update(value){context=value;for(const cb of listeners){try{cb(value);}catch(error){console.error(error);}}}addEventListener('message',event=>{if(event.source!==parent||!event.data||event.data.protocol!==protocol||event.data.session!==session)return;const message=event.data;if(message.type==='stop'){active=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('插件已停止'));}pending.clear();listeners.clear();return;}if(message.type==='context'){update(message.value);return;}const p=pending.get(message.id);if(!p)return;clearTimeout(p.timer);pending.delete(message.id);if(message.error)p.reject(new Error(message.error));else{if(message.id==='ready')update(message.value);p.resolve(message.value);}});const api=Object.freeze({ready:()=>ready,getContext:()=>request('getContext'),getSchedule:()=>request('getSchedule'),getCourses:date=>request('getCourses',{date}),getTheme:()=>request('getTheme'),selectDate:date=>request('selectDate',{date}),openCourse:id=>request('openCourse',{id}),requestImport:json=>request('requestImport',{json}),loadData:()=>request('loadData'),saveData:value=>request('saveData',{value}),onContext:cb=>{if(typeof cb!=='function')throw new Error('callback 必须为函数');listeners.add(cb);if(context)cb(context);return()=>listeners.delete(cb);}});Object.defineProperty(window,'DolphinPlugin',{value:api,writable:false,configurable:false});parent.postMessage({protocol,session,id:'ready',method:'ready'},'*');addEventListener('error',()=>parent.postMessage({protocol,session,id:'error',method:'runtimeError'},'*'));addEventListener('unhandledrejection',()=>parent.postMessage({protocol,session,id:'error',method:'runtimeError'},'*'));})();`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${sdk}</script><style>html{color-scheme:light dark}body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style></head><body>${pkg.html}<script>document.head.append(Object.assign(document.createElement('style'),{textContent:${scriptJSON(pkg.css??'')}}));Promise.resolve().then(()=>{new Function(${scriptJSON(pkg.javascript??'')})();});</script></body></html>`;
}
