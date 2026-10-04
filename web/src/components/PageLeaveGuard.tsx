import {useEffect,useRef,useState} from 'react';
import {Dialog} from './Dialog';

/** Only a page with unsaved input intercepts navigation; the saved pages remain one-tap. */
export function PageLeaveGuard({dirty,save,discard,busy=false}:{dirty:boolean|(()=>boolean);save?:()=>Promise<boolean>;discard:()=>void;busy?:boolean}){
  const current=useRef({dirty,save,discard,busy});current.current={dirty,save,discard,busy};
  const anchor=useRef<HTMLSpanElement>(null),savingNow=useRef(false);
  const pending=useRef<(()=>void)|null>(null),[open,setOpen]=useState(false),[saving,setSaving]=useState(false);
  useEffect(()=>{
    const request=(event:Event)=>{const screen=anchor.current?.closest('.screen');if(screen&&!screen.classList.contains('active'))return;const state=current.current,isDirty=typeof state.dirty==='function'?state.dirty():state.dirty;if(!isDirty&&!state.busy)return;event.preventDefault();if(state.busy||pending.current)return;pending.current=(event as CustomEvent<()=>void>).detail;setOpen(true);};
    window.addEventListener('dolphin-leave-page',request);
    return()=>window.removeEventListener('dolphin-leave-page',request);
  },[]);
  function stay(){if(savingNow.current)return;pending.current=null;setOpen(false);}
  function leave(){if(savingNow.current)return;const proceed=pending.current;pending.current=null;current.current.discard();setOpen(false);if(proceed)requestAnimationFrame(proceed);}
  async function saveAndLeave(){if(savingNow.current||!current.current.save)return;savingNow.current=true;setSaving(true);const proceed=pending.current;try{if(await current.current.save()){pending.current=null;setOpen(false);if(proceed)requestAnimationFrame(proceed);}else stayAfterError();}catch{stayAfterError();}finally{savingNow.current=false;setSaving(false);}}
  function stayAfterError(){pending.current=null;setOpen(false);}
  return <><span ref={anchor} hidden/><Dialog open={open} title="有尚未保存的内容" onClose={stay}><p>离开前可以继续编辑，或放弃这次修改。</p>{save&&<button className="primary full" disabled={saving} onClick={()=>void saveAndLeave()}>{saving?'正在保存…':'保存后离开'}</button>}<button className="secondary full" disabled={saving} onClick={stay}>继续编辑</button><button className="text-button full" disabled={saving} onClick={leave}>放弃修改并离开</button></Dialog></>;
}
