import {useMemo,useRef,type RefObject} from 'react';
import {coursePeriod,type Course,type Schedule} from '../lib/model';
import {gridRows} from '../lib/gridLayout';
import {periodRest} from '../lib/scheduleTime';
import {layoutCourses} from './timetablePresentation';
import {CurrentTimeLine} from './CurrentTimeLine';
import {Icon} from './Icon';

/** Day view uses the same section boundaries and overlap lanes as the week grid. */
export function DayTimetable({root,schedule,courses,selected,showTimes,now,showTimeLine,onOpen,onSwipe}:{root:RefObject<HTMLDivElement|null>;schedule:Schedule;courses:Course[];selected:string;showTimes:boolean;now:number;showTimeLine:boolean;onOpen:(course:Course,element:HTMLElement)=>void;onSwipe:(amount:number)=>void}){
 const rows=useMemo(()=>gridRows(schedule.periods),[schedule.periods]),positioned=useMemo(()=>layoutCourses(courses),[courses]),touch=useRef({x:0,y:0});
 return <div ref={root} className="timetable day-timetable" aria-label="日课表" style={{gridTemplateRows:rows.map(row=>`${row.height}px`).join(' ')}} onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-touch.current.x,dy=e.changedTouches[0].clientY-touch.current.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)onSwipe(dx<0?1:-1);}}>
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
