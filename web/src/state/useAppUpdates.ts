import {useEffect,useState} from 'react';
import {isNative,native} from '../lib/native';
export const RELEASES_URL='https://github.com/tequed232/Dolphin-Calendar/releases';
export type UpdateStatus={installed?:string;available:boolean;busy:boolean;checkedAt:number;message:string;release?:{version:string;url:string;notes:string;assetUrl?:string;assetSize?:number;assetName?:string};download?:'running'|'complete'|'failed';downloaded?:number;total?:number};
export function useAppUpdates(){
  const [status,setStatus]=useState<UpdateStatus>({available:false,busy:false,checkedAt:0,message:'尚未检查更新'});
  useEffect(()=>{
    const handle=(event:Event)=>setStatus((event as CustomEvent<UpdateStatus>).detail);
    window.addEventListener('dolphin-update',handle);
    if(isNative())native('updateStatus');
    return()=>window.removeEventListener('dolphin-update',handle);
  },[]);
  useEffect(()=>{
    if(!status.busy||!isNative())return;
    const timer=setInterval(()=>native('updateStatus'),1500);return()=>clearInterval(timer);
  },[status.busy]);
  return status;
}
