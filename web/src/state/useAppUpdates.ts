import {useEffect,useRef,useState} from 'react';
import {isNative,native} from '../lib/native';
import {loadReleaseCache,saveReleaseCache} from '../lib/storage';
import {APP_VERSION} from '../meta';
import {RELEASE_API,newerVersion,releaseFromAPI,type Release} from '../lib/releases';
export {RELEASES_URL} from '../lib/releases';
export type UpdateStatus={installed?:string;available:boolean;busy:boolean;checkedAt:number;message:string;release?:Release;download?:'running'|'complete'|'failed';downloaded?:number;total?:number};
const initial:UpdateStatus={available:false,busy:false,checkedAt:0,message:'尚未检查更新'};
export function useAppUpdates(autoUpdate=true,ready=true){
 const [status,setStatus]=useState<UpdateStatus>(initial),lock=useRef(false),latest=useRef(status);
 const [cacheReady,setCacheReady]=useState(isNative);latest.current=status;
 async function check(){
  if(isNative()){native('checkUpdate');return;}
  if(lock.current)return;lock.current=true;setStatus(s=>({...s,busy:true}));
  try{const response=await fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error(`GitHub 请求失败 (${response.status})`);const release=releaseFromAPI(await response.json());const next:UpdateStatus={installed:APP_VERSION,available:newerVersion(release.version),busy:false,checkedAt:Date.now(),message:newerVersion(release.version)?'发现新版本':'当前已是最新正式版本',release};setStatus(next);try{await saveReleaseCache(next);}catch{/* Cache is optional; schedule storage is independent. */}}
  catch{setStatus(s=>({...s,busy:false,message:'暂时无法检查更新，请稍后重试'}));}finally{lock.current=false;}
 }
 useEffect(()=>{if(isNative())return;let active=true;void loadReleaseCache().then(raw=>{const saved=raw as UpdateStatus;if(active&&saved?.release?.url?.startsWith('https://github.com/tequed232/Dolphin-Calendar/releases/tag/'))setStatus({...saved,available:newerVersion(saved.release.version),busy:false,installed:APP_VERSION});}).catch(()=>{}).finally(()=>{if(active)setCacheReady(true);});return()=>{active=false;};},[]);
 useEffect(()=>{const handle=(event:Event)=>setStatus((event as CustomEvent<UpdateStatus>).detail);window.addEventListener('dolphin-update',handle);if(isNative())native('updateStatus');return()=>window.removeEventListener('dolphin-update',handle);},[]);
 useEffect(()=>{if(!ready||!cacheReady||!autoUpdate||isNative())return;const maybe=()=>{if(Date.now()-latest.current.checkedAt>=86400000)void check();};maybe();const timer=setInterval(maybe,60*60*1000);return()=>clearInterval(timer);},[autoUpdate,ready,cacheReady]);
 useEffect(()=>{if(!status.busy||!isNative())return;const timer=setInterval(()=>native('updateStatus'),1500);return()=>clearInterval(timer);},[status.busy]);
 return {...status,check};
}
