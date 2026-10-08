import {useEffect,useMemo,useState,type RefObject} from 'react';
import type {Period} from '../lib/model';
import {currentTimePosition} from '../lib/scheduleTime';

/** Project one semantic time position onto the current layout without scrolling it. */
export function CurrentTimeLine({root,periods,now,visible,mode}:{root:RefObject<HTMLDivElement|null>;periods:Period[];now:number;visible:boolean;mode:'list'|'grid'}){
 const [top,setTop]=useState<number|null>(null);
 const position=useMemo(()=>currentTimePosition(periods,new Date(now)),[periods,now]);
 // Parent timetable refs are attached after child layout effects on first mount.
 useEffect(()=>{
  const container=root.current;
  if(!container||!visible||!position){setTop(null);return;}
  const rows=[...container.querySelectorAll<HTMLElement>(mode==='grid'?'.grid-period':'.period-row')];
  const measure=()=>{
   const row=rows[position.section-1];if(!row||!container.offsetWidth){setTop(null);return;}
   const bounds=container.getBoundingClientRect(),scale=bounds.width/container.offsetWidth,rect=row.getBoundingClientRect();
   const lesson=row.querySelector<HTMLElement>(mode==='grid'?'.grid-period-time':'.period-content');
   const end=mode==='grid'&&lesson?lesson.getBoundingClientRect().bottom:rect.bottom-(lesson?parseFloat(getComputedStyle(lesson).paddingBottom)*scale:0);
   const next=position.nextSection?rows[position.nextSection-1]?.getBoundingClientRect():undefined;
   const start=position.phase==='break'?end:rect.top,to=position.phase==='break'?(next?.top??end):end;
   setTop((start+(to-start)*position.progress-bounds.top)/scale);
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(container);rows.forEach(row=>observer.observe(row));
  return()=>observer.disconnect();
 },[root,position,visible,mode]);
 if(!visible||!position||top===null)return null;
 const time=`${String(new Date(now).getHours()).padStart(2,'0')}:${String(new Date(now).getMinutes()).padStart(2,'0')}`;
 return <div className="current-time-line" role="img" aria-label={`当前时间 ${time}`} data-time-section={position.section} data-time-phase={position.phase} style={{top}}/>;
}
