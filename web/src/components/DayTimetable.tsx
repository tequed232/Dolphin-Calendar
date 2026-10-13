import {useLayoutEffect,useMemo,useRef,type RefObject} from 'react';
import {coursePeriod,type Course,type Schedule} from '../lib/model';
import {gridRows} from '../lib/gridLayout';
import {periodRest} from '../lib/scheduleTime';
import {layoutCourses} from './timetablePresentation';
import {CurrentTimeLine} from './CurrentTimeLine';
import {Icon} from './Icon';

/** Day view uses the same section boundaries and overlap lanes as the week grid. */
export function DayTimetable({root,schedule,courses,selected,showTimes,now,showTimeLine,onOpen,onSwipe}:{root:RefObject<HTMLDivElement|null>;schedule:Schedule;courses:Course[];selected:string;showTimes:boolean;now:number;showTimeLine:boolean;onOpen:(course:Course,element:HTMLElement)=>void;onSwipe:(amount:number)=>void}){
 const rows=useMemo(()=>gridRows(schedule.periods),[schedule.periods]),positioned=useMemo(()=>layoutCourses(courses),[courses]),touch=useRef({id:null as number|null,x:0,y:0,multiple:false});
 // Chromium can keep a touch gesture latched to an overflowing card at its edge.
 // Allow native content scrolling inward; only hand an outward gesture to the list.
 // scrollHeight/clientHeight are integers; scrollTop can retain fractional zoom pixels.
 const edgeTolerance=2;
 const edgeTouch=useRef<{id:number;x:number;y:number;lastY:number;edge:'top'|'bottom';screen:HTMLElement;axis?:'x'|'y';forwarding?:boolean}|null>(null),skipClick=useRef(0);
 useLayoutEffect(()=>{
  const cards=Array.from(root.current?.querySelectorAll<HTMLElement>('.day-course')??[]);
  const update=(card:HTMLElement)=>{const max=card.scrollHeight-card.clientHeight;card.style.touchAction=max<=edgeTolerance?'pan-y':card.scrollTop<=edgeTolerance?'pan-down pinch-zoom':card.scrollTop>=max-edgeTolerance?'pan-up pinch-zoom':'pan-y';};
  const listeners=cards.map(card=>{const changed=()=>update(card);card.addEventListener('scroll',changed,{passive:true});update(card);return {card,changed};});
  const observer=new ResizeObserver(()=>cards.forEach(update));cards.forEach(card=>observer.observe(card));
  return()=>{observer.disconnect();listeners.forEach(({card,changed})=>{card.removeEventListener('scroll',changed);card.style.removeProperty('touch-action');});edgeTouch.current=null;};
 },[root,courses,showTimes,rows]);
 return <div ref={root} className="timetable day-timetable" aria-label="日课表" style={{gridTemplateRows:rows.map(row=>`${row.height}px`).join(' ')}}
  onPointerDown={event=>{
   edgeTouch.current=null;skipClick.current=0;if(event.pointerType!=='touch'||!event.isPrimary)return;
   const card=(event.target as HTMLElement).closest<HTMLElement>('.day-course'),screen=card?.closest<HTMLElement>('.screen');if(!card||!screen)return;
   const max=card.scrollHeight-card.clientHeight;if(max<=edgeTolerance)return;
   const edge=card.scrollTop<=edgeTolerance?'top':card.scrollTop>=max-edgeTolerance?'bottom':undefined;
   if(edge)edgeTouch.current={id:event.pointerId,x:event.clientX,y:event.clientY,lastY:event.clientY,edge,screen};
  }}
  onPointerMove={event=>{
   const gesture=edgeTouch.current;if(!gesture||event.pointerId!==gesture.id)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=8)gesture.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
   if(gesture.axis==='y'&&(gesture.forwarding||gesture.edge==='top'&&dy>8||gesture.edge==='bottom'&&dy< -8)){
    gesture.forwarding=true;gesture.screen.scrollTop+=gesture.lastY-event.clientY;skipClick.current=performance.now()+400;event.preventDefault();
   }
   if(gesture.axis)gesture.lastY=event.clientY;
  }}
  onPointerUp={()=>{edgeTouch.current=null;}} onPointerCancel={()=>{edgeTouch.current=null;}}
  onClickCapture={event=>{if(event.detail>0&&performance.now()<skipClick.current){event.preventDefault();event.stopPropagation();}}}
  onTouchStart={event=>{
   if(event.touches.length!==1){touch.current.multiple=true;return;}
   if(touch.current.id===null){const first=event.touches[0];touch.current={id:first.identifier,x:first.clientX,y:first.clientY,multiple:false};}
  }}
  onTouchEnd={event=>{
   if(event.touches.length)return;
   const start=touch.current;touch.current={id:null,x:0,y:0,multiple:false};if(start.multiple)return;
   const last=Array.from(event.changedTouches).find(point=>point.identifier===start.id);if(!last)return;
   const dx=last.clientX-start.x,dy=last.clientY-start.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)onSwipe(dx<0?1:-1);
  }} onTouchCancel={()=>{touch.current={id:null,x:0,y:0,multiple:false};}}>
  <CurrentTimeLine root={root} periods={schedule.periods} now={now} visible={showTimeLine} mode="list"/>
  {schedule.periods.map((period,i)=>{
   const rest=periodRest(schedule.periods,i),occupied=courses.some(course=>course.start<=i+1&&course.end>=i+1);
   return <div className="period-row" key={i} data-period={i+1} data-focus-kind="section" data-focus-date={selected} data-focus-section={i+1} style={{gridColumn:'1 / -1',gridRow:i+1}}>
    <div className="period-label" style={{height:rows[i].lesson}}><strong>{String(i+1).padStart(2,'0')}</strong>{period.label&&period.label!==String(i+1)&&<small className="period-name">{period.label}</small>}{showTimes&&<><span>{period.start||'待设'}</span><span>{period.end||'待设'}</span></>}</div>
    <div className="period-content" style={{paddingBottom:rows[i].breakHeight}}>{!occupied&&<div className="free-period" style={{height:rows[i].lesson}} aria-label={`第${i+1}节没有课程`}><span>—</span></div>}{rest&&<div className="day-break" style={{height:rows[i].breakHeight}} title={`${rest.label} ${rest.start}–${rest.end}`}><span>{rest.label}</span><small>{rest.start}–{rest.end}</small></div>}</div>
   </div>;
  })}
  {positioned.map(({course,lane,lanes})=><button key={course.id} className={`course-card day-course ${course.color} ${course.temporary?'temporary':''}`} aria-label={`${course.name}，${coursePeriod(course,schedule)}${showTimes?`，${schedule.periods[course.start-1]?.start}–${schedule.periods[course.end-1]?.end}`:''}，${course.room||'教室待填写'}，${course.teacher||'教师待填写'}`} data-course-id={course.id} data-focus-kind="course" data-focus-date={selected} data-focus-section={course.start} data-start={course.start} data-end={course.end} data-lane={lane} data-lanes={lanes} style={{gridColumn:2,gridRow:`${course.start} / ${course.end+1}`,marginBottom:rows[course.end-1].breakHeight,width:`calc((100% - ${(lanes-1)*8}px) / ${lanes})`,marginLeft:`calc(${lane/lanes*100}% + ${lane*8/lanes}px)`}} onContextMenu={e=>e.preventDefault()} onClick={e=>onOpen(course,e.currentTarget)}>
   <h3>{course.name}{course.temporary&&<small className="temporary-label">临时</small>}</h3>
   <span className="course-meta"><span><Icon name="pin" size={14}/>{course.room||'教室待填写'}</span><span>{course.teacher||'教师待填写'}</span></span>
  </button>)}
 </div>;
}
