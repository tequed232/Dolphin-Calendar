import {useEffect,useLayoutEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {useApp} from '../state/AppState';
import {addDays,dateKey,monday,parseDate,type Course} from '../lib/model';
import {gridRows,weekOccurrences,closestSection} from '../lib/gridLayout';
import {coursesConflict,periodRest} from '../lib/scheduleTime';
import {Dialog} from './Dialog';
import {CurrentTimeLine} from './CurrentTimeLine';
const THRESHOLD=8,HOLD=500;
type Gesture={course:Course;date:string;edge:'start'|'end'|'move';x:number;y:number;rowStarts:number[];rowEnds:number[];columnStep:number;pointerId:number;next:Course;moved:boolean};
type PositionedCourse={course:Course;lane:number;lanes:number};
function layoutCourses(courses:Course[]){
 const positioned:PositionedCourse[]=[],group:PositionedCourse[]=[],ends:number[]=[];let groupEnd=0;
 function finishGroup(){for(const item of group)item.lanes=ends.length;positioned.push(...group);group.length=0;ends.length=0;}
 for(const course of [...courses].sort((a,b)=>a.start-b.start||a.end-b.end)){
  if(group.length&&course.start>groupEnd)finishGroup();
  const available=ends.findIndex(end=>end<course.start),lane=available<0?ends.length:available;
  ends[lane]=course.end;groupEnd=Math.max(groupEnd,course.end);group.push({course,lane,lanes:1});
 }
 finishGroup();return positioned;
}
export function TimetableGrid({now,showTimeLine,statusHost,selected,interactive,create,view,focusCourse,selectDate,onEditingChange}:{now:number;showTimeLine:boolean;statusHost:HTMLElement|null;selected:string;interactive:boolean;create:(seed:Partial<Course>)=>void;view:(course:Course,date:string)=>void;focusCourse:(course:Course,date:string)=>void;selectDate:(date:string)=>void;onEditingChange:(editing:boolean)=>void}){
 const {data,update,toast}=useApp(),{schedule,settings}=data;
 const [selectedCourseId,setSelectedCourseId]=useState<string|null>(null),[gesture,setGesture]=useState<Gesture|null>(null),[pending,setPending]=useState<Course|null>(null),[conflicts,setConflicts]=useState<Course[]>([]),[saving,setSaving]=useState(false);
 const grid=useRef<HTMLDivElement>(null),selectedId=useRef<string|null>(null),active=useRef<Gesture|null>(null),hold=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),press=useRef<{x:number;y:number}|null>(null),ignoreClick=useRef(false),lock=useRef(false);
 // The date-strip preference must not change a weekly grid's columns on selection.
 const base=monday(parseDate(selected)),dayCount=7,days=Array.from({length:dayCount},(_,i)=>addDays(base,i));
 const weekKey=dateKey(base),rows=useMemo(()=>gridRows(schedule.periods),[schedule.periods]);
 const weekly=useMemo(()=>weekOccurrences(schedule,weekKey),[schedule,weekKey]);
 const isLayoutEditing=selectedCourseId!==null;
 function cancelGesture(){clearTimeout(hold.current);press.current=null;const value=active.current;active.current=null;setGesture(null);if(value&&grid.current?.hasPointerCapture(value.pointerId))grid.current.releasePointerCapture(value.pointerId);}
 function exit(){cancelGesture();selectedId.current=null;setSelectedCourseId(null);}
 function enter(course:Course,date:string){if(!interactive||lock.current)return;cancelGesture();selectedId.current=course.id;setSelectedCourseId(course.id);focusCourse(course,date);}
 useLayoutEffect(()=>{onEditingChange(isLayoutEditing);},[isLayoutEditing,onEditingChange]);
 useLayoutEffect(()=>{exit();},[interactive,weekKey]);
 useEffect(()=>{
  const dismiss=(event:Event)=>{if(selectedId.current){event.preventDefault();exit();}};
  // touch-action is decided at pointer-down, before the long press enters editing.
  // Stop native panning only for an active edit gesture so that the same held
  // finger can drag; ordinary browsing swipes still scroll the timetable.
  const editingMove=(event:TouchEvent)=>{if(event.cancelable&&event.touches.length===1&&active.current&&selectedId.current===active.current.course.id)event.preventDefault();};
  const table=grid.current;table?.addEventListener('touchmove',editingMove,{passive:false});
  window.addEventListener('dolphin-dismiss-layout-editing',dismiss);
  return()=>{table?.removeEventListener('touchmove',editingMove);window.removeEventListener('dolphin-dismiss-layout-editing',dismiss);clearTimeout(hold.current);onEditingChange(false);};
 },[]);
 async function persist(course:Course,allow=false){
  if(lock.current)return;const collisions=data.schedule.courses.filter(c=>coursesConflict(course,c,schedule.term.startDate));
  if(collisions.length&&!allow){exit();setPending(course);setConflicts(collisions);return;}
  lock.current=true;setSaving(true);
  try{await update(s=>({...s,schedule:{...s.schedule,courses:s.schedule.courses.map(c=>c.id===course.id?course:c)}}));setPending(null);focusCourse(course,dateKey(addDays(base,course.day-1)));toast(`已保存第 ${course.start}–${course.end} 节`);}catch{/* AppState reports persistence errors. */}finally{setSaving(false);lock.current=false;}
 }
 function measurement(e:PointerEvent<HTMLButtonElement>,course:Course,date:string,edge:Gesture['edge']):Gesture{
  const periods=grid.current!.querySelectorAll<HTMLElement>('.grid-period'),columns=grid.current!.querySelectorAll<HTMLElement>('.grid-day');
  return {course,date,edge,x:e.clientX,y:e.clientY,rowStarts:[...periods].map(row=>row.getBoundingClientRect().top),rowEnds:[...periods].map((row,i)=>{const rect=row.getBoundingClientRect();return rect.bottom-rows[i].breakHeight*rect.height/rows[i].height;}),columnStep:columns.length>1?columns[1].getBoundingClientRect().left-columns[0].getBoundingClientRect().left:columns[0].getBoundingClientRect().width,pointerId:e.pointerId,next:course,moved:false};
 }
 function pressCourse(e:PointerEvent<HTMLButtonElement>,course:Course,date:string){
  if(!interactive||lock.current||e.button!==0)return;clearTimeout(hold.current);press.current={x:e.clientX,y:e.clientY};
  const value=measurement(e,course,date,'move');
  if(selectedId.current===course.id)active.current=value;
  else hold.current=setTimeout(()=>{enter(course,date);ignoreClick.current=true;active.current=value;},HOLD);
 }
 function begin(e:PointerEvent<HTMLButtonElement>,course:Course,date:string,edge:'start'|'end'){
  if(selectedId.current!==course.id||lock.current)return;e.stopPropagation();e.preventDefault();cancelGesture();ignoreClick.current=true;
  active.current=measurement(e,course,date,edge);grid.current!.setPointerCapture(e.pointerId);
 }
 function move(e:PointerEvent<HTMLDivElement>){
  if(press.current&&Math.hypot(e.clientX-press.current.x,e.clientY-press.current.y)>THRESHOLD)clearTimeout(hold.current);
  const value=active.current;if(!value||value.pointerId!==e.pointerId)return;
  if(!value.moved&&Math.hypot(e.clientX-value.x,e.clientY-value.y)<THRESHOLD)return;
  e.preventDefault();ignoreClick.current=true;grid.current!.setPointerCapture(e.pointerId);
  const dy=closestSection(value.edge==='end'?value.rowEnds:value.rowStarts,value.edge==='end'?value.course.end:value.course.start,e.clientY-value.y)-(value.edge==='end'?value.course.end:value.course.start),dx=Math.round((e.clientX-value.x)/value.columnStep),length=value.course.end-value.course.start;
  const start=value.edge==='end'?value.course.start:value.edge==='start'?Math.max(1,Math.min(value.course.end,value.course.start+dy)):Math.max(1,Math.min(schedule.periods.length-length,value.course.start+dy));
  const end=value.edge==='start'?value.course.end:value.edge==='end'?Math.max(value.course.start,Math.min(schedule.periods.length,value.course.end+dy)):start+length;
  const day=value.edge==='move'?Math.max(1,Math.min(dayCount,value.course.day+dx)):value.course.day;
  const next={...value.course,start,end,day,...(value.course.specificDate?{specificDate:dateKey(addDays(base,day-1))}:{})};
  active.current={...value,next,moved:true};setGesture(active.current);
 }
 function finish(e:PointerEvent<HTMLDivElement>,cancel=false){
  clearTimeout(hold.current);press.current=null;const value=active.current;
  if(value?.pointerId!==e.pointerId)return;cancelGesture();
  if(value.moved&&!cancel&&(value.next.start!==value.course.start||value.next.end!==value.course.end||value.next.day!==value.course.day))void persist(value.next);
 }
 const occurrences=weekly.map(item=>gesture?.course.id===item.course.id?{course:gesture.next,date:dateKey(addDays(base,gesture.next.day-1))}:item);
 return <>{statusHost&&createPortal(<div className="layout-status"><p className="layout-hint" role="status">{isLayoutEditing?'拖动课程或上下把手；点空白或返回退出。':'点击查看，长按拖动；上下把手调整节次。'}</p>{isLayoutEditing&&<button className="text-button" onClick={exit}>完成</button>}</div>,statusHost)}<div className="week-grid-scroll"><div ref={grid} className="week-grid" data-layout-editing={isLayoutEditing} data-selected-course={selectedCourseId??''} style={{gridTemplateColumns:`48px repeat(${days.length},minmax(56px,1fr))`,gridTemplateRows:`48px ${rows.map(row=>`${row.height}px`).join(' ')}`}} aria-label="平铺课表" onPointerDownCapture={()=>{ignoreClick.current=false;}} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onClick={e=>{if(!ignoreClick.current&&!((e.target as HTMLElement).closest('.grid-course')))exit();}}>
  <CurrentTimeLine root={grid} periods={schedule.periods} now={now} visible={showTimeLine} mode="grid"/>
  <div className="grid-month">{base.getMonth()+1}月</div>
  {days.map((date,index)=><button key={index} className={`grid-day ${dateKey(date)===selected?'selected':''}`} data-focus-date={dateKey(date)} aria-label={`选择${dateKey(date)}`} style={{gridColumn:index+2,gridRow:1}} onClick={()=>{exit();selectDate(dateKey(date));}}><span>周{'一二三四五六日'[index]}</span><strong>{date.getDate()}</strong></button>)}
  {schedule.periods.map((period,i)=>{const rest=periodRest(schedule.periods,i);return <div key={i} data-period={i+1} data-break-height={rows[i].breakHeight} data-focus-kind="section" data-focus-section={i+1} data-focus-date={selected} className="grid-period" style={{gridColumn:1,gridRow:i+2}}><div className="grid-period-time" style={{height:rows[i].lesson}}><strong>{i+1}</strong>{settings.showTimes!==false&&<><small>{period.start}</small><small>{period.end}</small></>}</div>{rest&&<small className="grid-break-label" title={`${rest.label} ${rest.start}–${rest.end}`} aria-label={`${rest.label} ${rest.start}–${rest.end}`}>{rest.label}</small>}</div>;})}
  {days.map((date,column)=>{
   const key=dateKey(date),courses=occurrences.filter(item=>item.date===key).map(item=>item.course),positioned=layoutCourses(courses);
   return <div className="grid-column-fragment" key={key}>
    {schedule.periods.map((_,i)=>!courses.some(c=>c.start<=i+1&&c.end>=i+1)&&<button key={i} className="grid-empty" aria-label={`周${'一二三四五六日'[column]}第${i+1}节添加临时课程`} style={{gridColumn:column+2,gridRow:i+2,marginBottom:rows[i].breakHeight}} onClick={()=>{if(selectedId.current){exit();return;}create({day:column+1,start:i+1,end:i+1,specificDate:key});}}><span>+</span></button>)}
    {positioned.map(({course:current,lane,lanes})=>{const course=data.schedule.courses.find(c=>c.id===current.id)!,cardHeight=rows.slice(current.start-1,current.end).reduce((sum,row)=>sum+row.height,0)-rows[current.end-1].breakHeight+3*(current.end-current.start),editing=interactive&&selectedCourseId===course.id;
     return <div key={course.id} data-course-id={course.id} data-focus-kind="course" data-focus-date={key} data-focus-section={current.start} className={`grid-course ${course.color} ${course.temporary?'temporary':''} ${editing?'layout-selected':''} ${gesture?.course.id===course.id?'resizing':''}`} style={{gridColumn:column+2,gridRow:`${current.start+1} / ${Math.min(current.end,schedule.periods.length)+2}`,marginBottom:rows[current.end-1].breakHeight,marginLeft:lanes>1?`${lane/lanes*100}%`:undefined,marginRight:lanes>1?`${(lanes-lane-1)/lanes*100}%`:undefined}}>
      <button className="grid-course-content" style={{touchAction:editing?'none':'pan-y'}} onPointerDown={e=>pressCourse(e,course,key)} onContextMenu={e=>{e.preventDefault();ignoreClick.current=true;if(selectedId.current!==course.id)enter(course,key);}} onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();enter(course,key);}}} onClick={e=>{if(ignoreClick.current&&e.detail!==0)return;exit();view(course,key);}} title={`${course.name} · ${course.room}；点击查看，长按调整布局`}><strong style={{WebkitLineClamp:cardHeight<100?2:cardHeight<180?3:5}}>{course.name}</strong><span className="grid-course-room" style={{WebkitLineClamp:cardHeight<90?1:2}}>{course.room||'教室待填写'}</span>{course.teacher&&cardHeight>=135&&<small>{course.teacher}</small>}{cardHeight>=180&&<small>{course.temporary?'临时':`${current.start}–${current.end}节`}</small>}</button>
      {!editing&&<button className="layout-entry" aria-label={`${course.name}调整布局`} title="调整布局" onClick={e=>{e.stopPropagation();enter(course,key);}}>调整</button>}
      {editing&&(['start','end'] as const).map(edge=><button key={edge} className={`resize-handle ${edge}`} disabled={saving} aria-label={`${course.name}${edge==='start'?'开始':'结束'}节次拖动`} onClick={e=>e.stopPropagation()} onPointerDown={e=>begin(e,course,key,edge)} onKeyDown={e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();const delta=e.key==='ArrowUp'?-1:1;void persist({...course,[edge]:edge==='start'?Math.max(1,Math.min(course.end,course.start+delta)):Math.min(schedule.periods.length,Math.max(course.start,course.end+delta))});}}><span/></button>)}
      {gesture?.course.id===course.id&&<output className="resize-value">周{'一二三四五六日'[current.day-1]} 第 {current.start}–{current.end} 节</output>}
     </div>;
    })}
   </div>;
  })}
 </div></div><Dialog open={!!pending} title="课程时间冲突" onClose={()=>{if(!saving)setPending(null);}}><p role="alert">该时间段与「{conflicts.map(c=>c.name).join('、')}」冲突。</p><p className="hint">确认后同时保留两门课程，不会覆盖原课程。</p><div className="button-row"><button className="secondary" disabled={saving} onClick={()=>setPending(null)}>取消</button><button className="primary" disabled={saving} onClick={()=>pending&&void persist(pending,true)}>仍然保存</button></div></Dialog></>;
}
