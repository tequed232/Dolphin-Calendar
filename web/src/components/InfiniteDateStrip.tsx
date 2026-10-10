import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {addDays,dateKey,parseDate} from '../lib/model';
import {haptic} from '../lib/native';
import type {HolidayMark} from '../lib/holidays';

const WINDOW=181,EDGE=30,SHIFT=60;
const isWeekend=(date:Date)=>date.getDay()===0||date.getDay()===6;
function visibleDate(date:Date,offset:number,showWeekend:boolean){
  if(showWeekend)return addDays(date,offset);
  let result=new Date(date),remaining=Math.abs(offset),direction=Math.sign(offset);
  while(remaining){result=addDays(result,direction);if(!isWeekend(result))remaining--;}
  return result;
}
export function InfiniteDateStrip({selected,showWeekend,onSelect,holidayFor,orientation='horizontal'}:{selected:string;showWeekend:boolean;onSelect:(date:string)=>void;holidayFor?:(date:string)=>HolidayMark|undefined;orientation?:'horizontal'|'vertical'}){
  const viewport=useRef<HTMLDivElement>(null),rebase=useRef<{left:number;steps:number}|null>(null),rebasing=useRef(false),touching=useRef(false),idle=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),firstPaint=useRef(true),jumpToSelection=useRef(false);
  const displayWeekend=showWeekend||isWeekend(parseDate(selected));
  const [start,setStart]=useState(()=>visibleDate(parseDate(selected),-90,displayWeekend));
  const dates=useMemo(()=>Array.from({length:WINDOW},(_,index)=>visibleDate(start,index,displayWeekend)),[start,displayWeekend]);
  const vertical=orientation==='vertical',previousOrientation=useRef(orientation);
  const position=(node:HTMLDivElement)=>vertical?node.scrollTop:node.scrollLeft,size=(node:HTMLDivElement)=>vertical?node.clientHeight:node.clientWidth;
  const setPosition=(node:HTMLDivElement,value:number)=>{if(vertical)node.scrollTop=value;else node.scrollLeft=value;};
  const stride=()=>{const buttons=viewport.current?.querySelectorAll('button');return buttons&&buttons.length>1?(vertical?buttons[1].offsetTop-buttons[0].offsetTop:buttons[1].offsetLeft-buttons[0].offsetLeft):80;};
  const itemOffset=(node:HTMLDivElement,index:number)=>{const buttons=node.querySelectorAll('button');return buttons[index]&&buttons[0]?(vertical?buttons[index].offsetTop-buttons[0].offsetTop:buttons[index].offsetLeft-buttons[0].offsetLeft):index*stride();};
  useLayoutEffect(()=>{
    const node=viewport.current;if(!node)return;
    if(previousOrientation.current!==orientation){previousOrientation.current=orientation;jumpToSelection.current=true;}
    if(rebase.current){setPosition(node,rebase.current.left+rebase.current.steps*stride());rebase.current=null;rebasing.current=false;}
    if(firstPaint.current||jumpToSelection.current){
      const index=dates.findIndex(day=>dateKey(day)===selected);
      if(index>=0)setPosition(node,itemOffset(node,index)-(size(node)-stride())/2);
      firstPaint.current=false;jumpToSelection.current=false;
    }
  },[dates,selected,orientation]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const index=dates.findIndex(day=>dateKey(day)===selected);
    if(index<0){jumpToSelection.current=true;setStart(visibleDate(parseDate(selected),-90,displayWeekend));return;}
    const value=itemOffset(node,index)-(size(node)-stride())/2;
    node.scrollTo({...(vertical?{top:value}:{left:value}),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  },[selected,displayWeekend,orientation]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    let width=size(node),step=stride();
    const observer=new ResizeObserver(()=>{
      const nextWidth=size(node),nextStep=stride();
      if(nextWidth>0&&(Math.abs(nextWidth-width)>.5||Math.abs(nextStep-step)>.5)){
        const picked=node.querySelector<HTMLButtonElement>('button[aria-pressed=true]');
        if(picked){const index=[...node.querySelectorAll('button')].indexOf(picked);setPosition(node,itemOffset(node,index)-(nextWidth-(vertical?picked.offsetHeight:picked.offsetWidth))/2);}
      }
      width=nextWidth;step=nextStep;
    });
    observer.observe(node);const item=node.querySelector('button');if(item)observer.observe(item);
    return()=>observer.disconnect();
  },[orientation]);
  function replenish(){
    const node=viewport.current;if(!node||rebasing.current||touching.current)return;
    const offset=position(node),index=offset/stride();
    if(index<EDGE){rebasing.current=true;rebase.current={left:offset,steps:SHIFT};setStart(current=>visibleDate(current,-SHIFT,displayWeekend));}
    else if(index>WINDOW-EDGE-4){rebasing.current=true;rebase.current={left:offset,steps:-SHIFT};setStart(current=>visibleDate(current,SHIFT,displayWeekend));}
  }
  const latestReplenish=useRef(replenish);latestReplenish.current=replenish;
  useEffect(()=>{const node=viewport.current;const end=()=>latestReplenish.current();node?.addEventListener('scrollend',end);return()=>{clearTimeout(idle.current);node?.removeEventListener('scrollend',end);};},[]);
  function onScroll(){clearTimeout(idle.current);idle.current=setTimeout(()=>latestReplenish.current(),240);}
  return <div ref={viewport} className={`date-strip ${vertical?'vertical-date-strip':''}`} data-orientation={orientation} role="group" aria-label="连续日期" onScroll={onScroll} onTouchStart={()=>{touching.current=true;clearTimeout(idle.current);}} onTouchEnd={()=>{touching.current=false;onScroll();}} onTouchCancel={()=>{touching.current=false;onScroll();}}>
    {dates.map(day=>{const key=dateKey(day),holiday=holidayFor?.(key);return <button key={key} data-date={key} className={`date-item ${selected===key?'selected':''} ${holiday?'holiday-date holiday-'+holiday.kind:''}`} aria-pressed={selected===key} title={holiday?.description} aria-label={`${day.getFullYear()}年${day.getMonth()+1}月${day.getDate()}日 周${'一二三四五六日'[(day.getDay()+6)%7]}${holiday?'，'+holiday.description:''}`} onClick={()=>{onSelect(key);haptic();}}><span>周{'一二三四五六日'[(day.getDay()+6)%7]}</span><strong>{String(day.getDate()).padStart(2,'0')}</strong><i className={key===dateKey(new Date())?'today-dot':''}/>{holiday&&<b className={`holiday-mark ${holiday.kind}`} aria-hidden="true">{holiday.label}</b>}</button>;})}
  </div>;
}
