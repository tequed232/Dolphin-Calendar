import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Icon} from './Icon';

export type Choice = {value:string|number;label:ReactNode};

export function ChoiceSelect({label,value,options,onChange}:{label:string;value:string|number;options:Choice[];onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false),[up,setUp]=useState(false),[height,setHeight]=useState(290);
  const root=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
  const current=options.find(option=>String(option.value)===String(value));
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('.choice-trigger')?.focus();}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);};
  },[open]);
  useLayoutEffect(()=>{
    if(!open)return;
    const field=root.current!;
    function position(){
      const box=field.getBoundingClientRect(),viewport=window.visualViewport;
      let top=viewport?.offsetTop??0,bottom=top+(viewport?.height??innerHeight);
      // A native keyboard can shorten a dialog without changing innerHeight.
      // Keep the options inside every scroll/clip ancestor, including that dialog.
      for(let parent=field.parentElement;parent;parent=parent.parentElement){
        if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)){
          const bounds=parent.getBoundingClientRect();top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);
        }
      }
      const heading=field.closest('dialog')?.querySelector('.dialog-heading')?.getBoundingClientRect();
      if(heading)top=Math.max(top,heading.bottom);
      const below=Math.max(0,bottom-box.bottom-6),above=Math.max(0,box.top-top-6),scale=box.height/field.offsetHeight||1;
      const upward=below<Math.min(options.length*44+14,290)*scale&&above>below;
      setUp(upward);setHeight(Math.max(0,Math.min(290,(upward?above:below)/scale)));
    }
    position();
    const selected=menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')??menu.current?.querySelector<HTMLButtonElement>('button');
    selected?.focus({preventScroll:true});
    if(selected&&menu.current)menu.current.scrollTop=Math.max(0,selected.offsetTop-menu.current.clientHeight/2+selected.offsetHeight/2);
    let frame=0;
    const schedulePosition=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;position();});};
    const scrolled=(event:Event)=>{if(event.target!==menu.current)schedulePosition();};
    const resized=new ResizeObserver(schedulePosition);resized.observe(field);
    for(let parent=field.parentElement;parent;parent=parent.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY))resized.observe(parent);
    window.addEventListener('resize',schedulePosition);window.visualViewport?.addEventListener('resize',schedulePosition);document.addEventListener('scroll',scrolled,true);
    return()=>{cancelAnimationFrame(frame);resized.disconnect();window.removeEventListener('resize',schedulePosition);window.visualViewport?.removeEventListener('resize',schedulePosition);document.removeEventListener('scroll',scrolled,true);};
  },[open,options.length]);
  useLayoutEffect(()=>{if(open&&menu.current?.contains(document.activeElement)){
    const focused=document.activeElement as HTMLElement;menu.current.scrollTop=Math.max(0,focused.offsetTop-menu.current.clientHeight/2+focused.offsetHeight/2);
  }},[open,height,up]);
  function toggle(){
    setOpen(value=>!value);
  }
  function focusOption(amount:number| 'first'|'last'){
    const choices=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button')??[]);if(!choices.length)return;
    const index=choices.indexOf(document.activeElement as HTMLButtonElement),next=amount==='first'?0:amount==='last'?choices.length-1:(Math.max(0,index)+amount+choices.length)%choices.length;
    const option=choices[next];option.focus({preventScroll:true});
    const bounds=option.getBoundingClientRect(),windowBounds=menu.current!.getBoundingClientRect();
    const scale=windowBounds.height/menu.current!.offsetHeight||1;
    if(bounds.top<windowBounds.top)menu.current!.scrollTop-=(windowBounds.top-bounds.top)/scale;
    else if(bounds.bottom>windowBounds.bottom)menu.current!.scrollTop+=(bounds.bottom-windowBounds.bottom)/scale;
  }
  return <div className={`field choice-field${up?' choice-up':''}`} ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <span className="choice-label">{label}</span>
    <button type="button" className="choice-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={toggle} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}}}>
      <span>{current?.label??'请选择'}</span><Icon name="chevron" size={18}/>
    </button>
    {open&&<div ref={menu} className="choice-menu" id={id} role="listbox" aria-label={label} style={{maxHeight:height}} onKeyDown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();focusOption(event.key==='Home'?'first':event.key==='End'?'last':event.key==='ArrowDown'?1:-1);}else if(event.key==='Tab'){setOpen(false);root.current?.querySelector<HTMLButtonElement>('.choice-trigger')?.focus({preventScroll:true});}}}>
      {options.map(option=><button type="button" role="option" tabIndex={-1} key={String(option.value)} aria-selected={String(option.value)===String(value)} onClick={()=>{onChange(String(option.value));setOpen(false);root.current?.querySelector<HTMLButtonElement>('.choice-trigger')?.focus({preventScroll:true});}}>{option.label}{String(option.value)===String(value)&&<span aria-hidden="true">✓</span>}</button>)}
    </div>}
  </div>;
}
