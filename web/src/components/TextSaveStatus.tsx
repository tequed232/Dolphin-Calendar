import {useEffect,useRef} from 'react';
import type {useAutosavedText} from '../state/useAutosavedText';
import {PageLeaveGuard} from './PageLeaveGuard';

export function TextSaveStatus({editor}:{editor:ReturnType<typeof useAutosavedText>}){
 const current=useRef(editor),anchor=useRef<HTMLSpanElement>(null),leaving=useRef(false);current.current=editor;
 useEffect(()=>{
  const request=(event:Event)=>{
   if(!anchor.current?.closest('.screen.active'))return;
   const state=current.current;
   if(state.error||!state.dirty()&&!state.busy)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(leaving.current)return;leaving.current=true;
   const proceed=(event as CustomEvent<()=>void>).detail;
   void state.flush().then(saved=>{if(saved)proceed();}).finally(()=>{leaving.current=false;});
  };
  window.addEventListener('dolphin-leave-page',request,true);
  return()=>window.removeEventListener('dolphin-leave-page',request,true);
 },[]);
 return <><span ref={anchor} hidden/><PageLeaveGuard dirty={()=>!!editor.error&&editor.dirty()} busy={editor.busy} save={editor.flush} discard={editor.discard}/>
  <p className={editor.error?'field-error':'hint'} role={editor.error?'alert':'status'}>{editor.error||(editor.busy?'正在保存…':editor.dirty()?'输入完成后自动保存。':'已保存在本机。')}</p>
  {editor.error&&<button className="secondary" onClick={()=>void editor.flush()}>重试保存</button>}
 </>;
}
