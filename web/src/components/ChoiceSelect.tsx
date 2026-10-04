import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Icon} from './Icon';

export type Choice = {value:string|number;label:ReactNode};

export function ChoiceSelect({label,value,options,onChange}:{label:string;value:string|number;options:Choice[];onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false),[up,setUp]=useState(false);
  const root=useRef<HTMLDivElement>(null),id=useId();
  const current=options.find(option=>String(option.value)===String(value));
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('.choice-trigger')?.focus();}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);};
  },[open]);
  function toggle(){
    if(!open){const box=root.current?.getBoundingClientRect();setUp(!!box&&innerHeight-box.bottom<Math.min(options.length*50+20,300)&&box.top>220);}
    setOpen(value=>!value);
  }
  return <div className={`field choice-field${up?' choice-up':''}`} ref={root}>
    <span className="choice-label">{label}</span>
    <button type="button" className="choice-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={toggle}>
      <span>{current?.label??'请选择'}</span><Icon name="chevron" size={18}/>
    </button>
    {open&&<div className="choice-menu" id={id} role="listbox" aria-label={label}>
      {options.map(option=><button type="button" role="option" key={String(option.value)} aria-selected={String(option.value)===String(value)} onClick={()=>{onChange(String(option.value));setOpen(false);}}>{option.label}{String(option.value)===String(value)&&<span aria-hidden="true">✓</span>}</button>)}
    </div>}
  </div>;
}
