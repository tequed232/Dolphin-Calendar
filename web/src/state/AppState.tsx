import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initialData, type AppData } from '../lib/model';
import { loadData, commitData, onDataChange } from '../lib/storage';
import { isNative,native } from '../lib/native';
import { notificationCover } from '../lib/notificationCover';
import {useHolidayReader} from './useHolidayReader';
import {useAppUpdates} from './useAppUpdates';
type Context = { data:AppData;ready:boolean;error:string; update:(fn:(previous:AppData)=>AppData)=>Promise<void>;toast:(message:string)=>void;holidayReader:ReturnType<typeof useHolidayReader>;appUpdates:ReturnType<typeof useAppUpdates> };
const AppContext=createContext<Context>(null!);
export function AppProvider({children}:{children:ReactNode}) {
  const [data,setData]=useState(initialData),[ready,setReady]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const latest=useRef(data),queue=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
  function toast(value:string){setMessage(value);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),4500);}
  useEffect(()=>{loadData().then(value=>{latest.current=value;setData(value);setReady(true);}).catch(e=>setError(`本地数据无法读取：${e.message}。请保留应用数据并重新打开。`));return()=>clearTimeout(timer.current);},[]);
  useEffect(()=>{
    let active=true,refreshing=false,pending=false;
    const refresh=()=>{
      pending=true;if(refreshing)return;refreshing=true;
      const task=queue.current.then(async()=>{pending=false;const value=await loadData(latest.current);if(active){latest.current=value;setData(value);}});
      queue.current=task.catch(()=>{});
      void task.catch(()=>{if(active)toast('其他窗口的数据暂未读取完成，请重新打开页面；本机数据已保留。');}).finally(()=>{refreshing=false;if(active&&pending)refresh();});
    };
    const stop=onDataChange(refresh);return()=>{active=false;stop();};
  },[]);
  async function update(fn:(previous:AppData)=>AppData) {
    const task=queue.current.then(async()=>{
      if(!ready) throw new Error('本地数据尚未就绪');
      const next=await commitData(fn,latest.current);
      // 成功落库后统一广播，避免导入页与主页持有不同数据。
      latest.current=next;setData(next);
    });
    queue.current=task.catch(()=>{});try{await task;}catch(e){toast(`保存失败：${(e as Error).message}`);throw e;}
  }
  const nativeSnapshot=useRef<{schedule:AppData['schedule'];books:AppData['books'];settings:string}|null>(null);
  const holidayReader=useHolidayReader(data,update);
  const appUpdates=useAppUpdates(data.settings.autoUpdate,ready);
  const {notificationsEnabled,reminders,advance,journeyLive,pet,poke,lines,school,map,autoUpdate,directDownload}=data.settings;
  const nativeSettings=JSON.stringify({notificationsEnabled,reminders,advance,journeyLive,pet,poke,lines,school,map,autoUpdate,directDownload});
  useEffect(()=>{
    if(!ready||!isNative()) return;
    const settings=nativeSettings;
    const previous=nativeSnapshot.current;
    if(previous?.schedule===data.schedule&&previous.books===data.books&&previous.settings===settings)return;
    nativeSnapshot.current={schedule:data.schedule,books:data.books,settings};
    native('sync',{schedule:data.schedule,settings:data.settings,bookTitles:Object.fromEntries(Object.entries(data.books).map(([course,book])=>[course,book.title]))});
  },[ready,data.schedule,nativeSettings,data.books]);
  // Covers only change with textbooks. Course edits and reminder settings need no image decode.
  useEffect(()=>{
    if(!ready||!isNative())return;
    let active=true;
    void (async()=>{
      const covers:Record<string,string>={};
      let total=0;
      for(const [course,book] of Object.entries(data.books).slice(0,128)) {
        if(!active)return;
        if(!book.cover) continue;
        const thumb=await notificationCover(book.cover);
        if(thumb && total+thumb.length<800_000) {covers[course]=thumb;total+=thumb.length;}
      }
      if(active) native('bookCovers',{covers});
    })();
    return()=>{active=false;};
  },[ready,data.books]);
  return <AppContext.Provider value={{data,ready,error,update,toast,holidayReader,appUpdates}}>{children}{message&&<div className="toast" role="status">{message}</div>}</AppContext.Provider>;
}
export const useApp=()=>useContext(AppContext);
