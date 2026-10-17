import {useEffect,useRef,useState} from 'react';

/** Keep editing synchronous; serialize and coalesce storage work behind the draft. */
export function useAutosavedText(saved:string,persist:(value:string)=>Promise<void>){
 const [value,setValue]=useState(saved),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const draft=useRef(saved),committed=useRef(saved),external=useRef(saved),writer=useRef(persist),composing=useRef(false);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),running=useRef<Promise<boolean>|null>(null),mounted=useRef(true);
 writer.current=persist;
 const dirty=()=>draft.current!==committed.current;
 function schedule(){clearTimeout(timer.current);if(!composing.current)timer.current=setTimeout(()=>void flush(),300);}
 function change(next:string){draft.current=next;setValue(next);setError('');schedule();}
 async function flush():Promise<boolean>{
  clearTimeout(timer.current);
  if(composing.current)return false;
  if(running.current){if(!await running.current)return false;return flush();}
  if(!dirty())return true;
  const snapshot=draft.current;setBusy(true);setError('');
  const task=(async()=>{
   try{await writer.current(snapshot);committed.current=snapshot;return true;}
   catch(cause){if(mounted.current)setError(`未能保存：${cause instanceof Error?cause.message:String(cause)}。输入仍保留，请重试。`);return false;}
  })();
  running.current=task;
  const success=await task;
  running.current=null;
  if(mounted.current){setBusy(false);if(success&&dirty())schedule();}
  return success&&!dirty();
 }
 function discard(){clearTimeout(timer.current);draft.current=committed.current;setValue(committed.current);setError('');}
 useEffect(()=>{
  if(external.current===saved)return;external.current=saved;
  if(!dirty()&&!running.current){draft.current=committed.current=saved;setValue(saved);}
 },[saved]);
 useEffect(()=>{
  mounted.current=true;
  const unload=(event:BeforeUnloadEvent)=>{if(dirty()){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  return()=>{mounted.current=false;clearTimeout(timer.current);window.removeEventListener('beforeunload',unload);};
 },[]);
 return {value,change,dirty,busy,error,flush,discard,
  compositionStart:()=>{composing.current=true;clearTimeout(timer.current);},
  compositionEnd:(next:string)=>{composing.current=false;change(next);}};
}
