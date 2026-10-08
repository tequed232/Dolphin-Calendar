import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {InfiniteDateStrip} from '../components/InfiniteDateStrip';
import {CalendarPicker} from '../components/CalendarPicker';
import {useApp} from '../state/AppState';
import type {HomeView} from '../state/useHomeFocus';
import {coursePeriod,courseDates,compactWeeks,addDays,coursesOn,dateKey,parseDate,weekOf,type Course,type Schedule} from '../lib/model';
import {Icon} from '../components/Icon';
import {haptic} from '../lib/native';
import {holidayLookup} from '../lib/holidays';
import '../theme/home-search-experience.css';
import '../theme/updates.css';
import {TimetableGrid} from '../components/TimetableGrid';
import {CurrentTimeLine} from '../components/CurrentTimeLine';
import '../theme/timetable.css';
function timeBand(time:string){const hour=Number(time.split(':')[0]);return hour<12?'上午':hour<14?'中午':hour<18?'下午':'晚上';}
function courseDateSuggestions(schedule:Schedule,selected:string){
  let first:string|undefined,next:string|undefined;
  for(const course of schedule.courses.filter(c=>c.start>=1&&c.end<=schedule.periods.length))for(const key of courseDates(course,schedule)){
    if(!first||key<first)first=key;if(key>selected&&(!next||key<next))next=key;
  }
  return {first,next};
}
export function Home({openCourse,openImport,addCourse,navigate,visible,openUpdates,quickAdd,manage,view,mode,overlayOpen=false,onLayoutEditingChange}:{openCourse:(c:Course,el?:HTMLElement)=>void;openImport:()=>void;addCourse?:()=>void;navigate:(c:Course)=>void;visible:boolean;openUpdates?:()=>void;quickAdd?:(seed:Partial<Course>)=>void;manage:()=>void;view:HomeView;mode:'list'|'grid';overlayOpen?:boolean;onLayoutEditingChange:(editing:boolean)=>void}){
  const {data,ready,appUpdates,update}=useApp(),{schedule,settings}=data;
  const selected=view.focus.date,setSelected=view.selectDate;
  const holidays=useMemo(()=>holidayLookup(data),[data]),holidayFor=(key:string)=>holidays.get(key);
  const [now,setNow]=useState(Date.now());
  const [calendarOpen,setCalendarOpen]=useState(false),touch=useRef({x:0,y:0});
  const [actionsHost,setActionsHost]=useState<HTMLElement|null>(null),[layoutStatusHost,setLayoutStatusHost]=useState<HTMLDivElement|null>(null);
  const listTable=useRef<HTMLDivElement>(null);
  const date=parseDate(selected),courses=coursesOn(schedule,date),week=weekOf(date,schedule.term.startDate);
  const suggestions=useMemo(()=>courseDateSuggestions(schedule,selected),[schedule,selected]);
  const day=(date.getDay()+6)%7;
  const lines=settings.lines.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const dayNumber=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
  const greetingLine=lines.length?lines[((dayNumber%lines.length)+lines.length)%lines.length]:'留一点从容，给每一天。';
  const activeIds=new Set(courses.map(course=>course.id));
  // 其他周课程单独展示，整学年课表可查看，也不会被当成所选日期的安排。
  const otherWeekCourses=schedule.courses.filter(course=>course.start>=1&&course.end<=schedule.periods.length&&!course.specificDate&&course.day===day+1&&!activeIds.has(course.id)).sort((a,b)=>a.start-b.start||a.weeks[0]-b.weeks[0]);
  const current=courses.find(c=>{const end=new Date(`${selected}T${schedule.periods[c.end-1]?.end}:00`).getTime();return selected>=dateKey(new Date(now))&&end>now;});
  const isToday=selected===dateKey(new Date(now));
  const isCurrentWeek=week===weekOf(new Date(now),schedule.term.startDate);
  const showTimeLine=visible&&settings.showCurrentTimeLine!==false&&(mode==='grid'?isCurrentWeek:isToday);
  const inProgress=current&&isToday&&now>=new Date(`${selected}T${schedule.periods[current.start-1]?.start}:00`).getTime();
  const emptyReason=week<1?`所选日期早于课表第 1 周，开学日期为 ${schedule.term.startDate.replaceAll('-','/')}。`:week>schedule.term.weeks?`所选日期已超出课表的 ${schedule.term.weeks} 周范围。`:otherWeekCourses.length?`当前是第 ${week} 周；同星期的其他周课程可在下方展开查看。`:`课表在第 ${week} 周的星期${'一二三四五六日'[day]}没有安排课程。`;
  const suggestedDate=suggestions.next??suggestions.first;
  const suggestedLabel=suggestions.next?`查看 ${parseDate(suggestions.next).getFullYear()!==date.getFullYear()?parseDate(suggestions.next).getFullYear()+' 年 ':''}${parseDate(suggestions.next).getMonth()+1} 月 ${parseDate(suggestions.next).getDate()} 日课程`:'查看本学期有课日期';
  useEffect(()=>{const refresh=()=>setNow(Date.now()),resume=()=>{if(!document.hidden)refresh();};const id=setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',resume);return()=>{clearInterval(id);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',resume);};},[]);
  useEffect(()=>{setActionsHost(document.getElementById('home-actions-portal'));},[]);

  function move(amount:number){setSelected(dateKey(addDays(date,amount)));haptic();}
  function selectDate(value:string){setSelected(value);setCalendarOpen(false);haptic();}
  function courseCard(course:Course,otherWeek=false){return <button key={course.id} className={`course-card ${course.temporary?'temporary':''} ${course.color} ${otherWeek?'other-week':''}`} data-course-id={otherWeek?undefined:course.id} data-focus-kind={otherWeek?undefined:'course'} data-focus-date={selected} data-focus-section={course.start} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(!otherWeek)view.rememberCourse(course,selected);openCourse(course,e.currentTarget);}}><span className="course-topline"><span>{coursePeriod(course,schedule)}</span>{(otherWeek||settings.showTimes!==false)&&<span>{otherWeek?`第 ${compactWeeks(course.weeks)} 周`:`${schedule.periods[course.start-1]?.start} – ${schedule.periods[course.end-1]?.end}`}</span>}</span><h3>{course.name}{course.temporary&&<small className="temporary-label">临时</small>}</h3><span className="course-meta"><span><Icon name="pin" size={14}/>{course.room||'教室待填写'}</span><span>{course.teacher||'教师待填写'}</span></span></button>;}
  return <div ref={view.roots[mode]} className={`home-inner ${mode==='grid'?'grid-view':''}`} data-focus-date={selected} data-focus-section={view.focus.sectionIndex} data-focus-course={view.focus.courseId}>
    <div ref={view.headers[mode]} className={`home-controls ${mode==='grid'?'grid-controls':'list-controls'}`} data-toolbar-hidden={mode==='grid'&&view.gridToolbarHidden} inert={mode==='grid'&&view.gridToolbarHidden} aria-hidden={mode==='grid'&&view.gridToolbarHidden?true:undefined}>
    <header className="brand-row">
      <button className="grid-heading home-date-select" aria-label="选择日期" onClick={()=>setCalendarOpen(true)}><h1>{week>0?`第 ${week} 周`:'学期外'} <span>周{'一二三四五六日'[day]}</span></h1><small>{selected.replaceAll('-','/')} <Icon name="calendar" size={12}/></small></button>
      <div className="home-header-actions">{appUpdates.available&&openUpdates&&<button className="update-indicator" aria-label="有新版本，前往更新页面" title="发现新版本" onClick={openUpdates}><Icon name="download" size={22}/></button>}<button className="icon-button header-action" aria-label="添加临时课程" title="添加临时课程" onClick={()=>quickAdd?.({day:day+1,start:view.focus.sectionIndex,end:view.focus.sectionIndex,specificDate:selected})}><Icon name="add" size={23}/></button><button className="icon-button header-action" aria-label="导入课表" title="导入课表：JSON、CSV 或 Excel" onClick={openImport}><Icon name="upload" size={22}/></button></div>
    </header>
    <div className="grid-toolbar"><button className="text-button" onClick={manage}><Icon name="calendar" size={15}/>课表管理</button><div className="week-controls"><button className="icon-button" aria-label="上一周" title="上一周" onClick={()=>move(-7)}><Icon name="back" size={18}/></button><button className="text-button" aria-label="回到今天" title={isCurrentWeek?'正在查看本周，点击回到今天':'回到今天'} onClick={()=>selectDate(dateKey(new Date()))}>{isCurrentWeek?'本周':'回到今天'}</button><button className="icon-button" aria-label="下一周" title="下一周" onClick={()=>move(7)}><Icon name="next" size={18}/></button></div></div>
    {mode==='grid'&&<div className="grid-layout-host" ref={setLayoutStatusHost}/> }
    </div><div className="home-content">
    {mode!=='grid'&&<><div className="greeting">
      <div><h1>{isToday?'今天':`${date.getMonth()+1}月${date.getDate()}日`}</h1><p className="greeting-line">{greetingLine}</p></div>
      <span className="week-badge">{week>0&&week<=schedule.term.weeks?`第 ${String(week).padStart(2,'0')} 周`:'学期外'}</span>
    </div>
    <section className="date-panel" aria-label="选择要查看课程的日期"><div className="month-row"><div className="date-title"><span><strong>{date.getFullYear()} 年 {date.getMonth()+1} 月</strong></span></div></div><InfiniteDateStrip selected={selected} showWeekend={settings.showWeekend} onSelect={setSelected} holidayFor={holidayFor}/><p className="date-panel-hint">左右滑动选日期，或打开月历跳转</p></section>
    <div className="term-row"><span>{schedule.term.name}</span><span role="status" aria-live="polite" aria-atomic="true" aria-label={`${selected}，星期${'一二三四五六日'[day]}，${courses.length} 门课程`}>星期{'一二三四五六日'[day]} · {courses.length} 门课程</span></div>
    </>}
    {mode==='grid'?<TimetableGrid now={now} showTimeLine={showTimeLine} statusHost={layoutStatusHost} selected={selected} interactive={visible&&!overlayOpen} create={seed=>quickAdd?.(seed)} view={(course,date)=>{view.rememberCourse(course,date);openCourse(course);}} focusCourse={view.rememberCourse} selectDate={view.selectDate} onEditingChange={onLayoutEditingChange}/>:<>
    {current?<button className="next-course" onContextMenu={e=>e.preventDefault()} onClick={e=>{view.rememberCourse(current,selected);openCourse(current,e.currentTarget);}}>
      <span className="next-icon"><Icon name="clock"/></span>
      <span><small>{inProgress?'正在上课':isToday?'下一节课':'当天第一节'}</small><strong>{current.name}</strong><span className="next-place">{current.room||'教室待填写'}</span></span>
      <span className="next-time">{settings.showTimes!==false&&schedule.periods[current.start-1]?.start}<small>查看详情</small></span>
    </button>:!!schedule.courses.length&&courses.length>0&&<div className="free-day"><Icon name="sun" size={19}/><span>{isToday?'今天的课程已结束，辛苦啦。':'点击下方课程，查看教材、教室与上课周次。'}</span></div>}
    {holidayFor(selected)&&<div className="selected-holiday"><b className={`holiday-mark ${holidayFor(selected)!.kind}`} aria-hidden="true">{holidayFor(selected)!.label}</b><div><p>{holidayFor(selected)!.description}</p><small>仅标记日期，课程与提醒按原课表安排。</small></div></div>}
    <div className="section-heading home-schedule-heading"><div><h2>{isToday?'今日日程':'所选日期的日程'}</h2><p>课程按上课时间排列，点选可查看详情</p></div><span>{courses.length} 门课程</span></div>
    {!schedule.courses.length&&<div className="empty-card home-welcome-card"><div className="empty-symbol"><Icon name="calendar" size={32}/></div><h3>从第一份课表开始</h3><p>粘贴 JSON 内容或选择课表文件，<br/>预览并确认后，就能在这里查看课程。</p><div className="welcome-actions"><button className="primary" onClick={openImport}><Icon name="add" size={18}/>导入我的课表</button>{addCourse&&<button className="text-button" onClick={addCourse}>没有课表文件？手动添加</button>}</div></div>}
    {!!schedule.courses.length&&!courses.length&&<div className="selected-day-empty empty-day-guidance"><div className="empty-day-overview"><span className="empty-day-icon"><Icon name="sun" size={25}/></span><div><h3>{isToday?'今天没有课程':'所选日期没有课程'}</h3><p>{emptyReason}</p></div></div><div className="empty-day-actions">{suggestedDate&&<button className="secondary" onClick={()=>selectDate(suggestedDate)}>{suggestedLabel}</button>}<button className="text-button" onClick={()=>setCalendarOpen(true)}>打开月历选日期</button></div></div>}
    {!!courses.length&&<div ref={listTable} className="timetable" onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-touch.current.x,dy=e.changedTouches[0].clientY-touch.current.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);}}>
    <CurrentTimeLine root={listTable} periods={schedule.periods} now={now} visible={showTimeLine} mode="list"/>
    {schedule.periods.map((period,i)=>{const starts=courses.filter(c=>c.start===i+1),occupied=courses.some(c=>c.start<i+1&&c.end>=i+1),band=period.label?.includes('中午')?'中午':timeBand(period.start),previous=schedule.periods[i-1],previousBand=previous?.label?.includes('中午')?'中午':previous?timeBand(previous.start):'';return <div className="period-row" key={i} data-focus-kind="section" data-focus-date={selected} data-focus-section={i+1}><div className="period-label"><small>{i===0||band!==previousBand?band:''}</small><strong>{period.label??String(i+1).padStart(2,'0')}</strong>{settings.showTimes!==false&&<span>{period.start||'待设'}</span>}</div><div className="period-content">{starts.map(c=>courseCard(c))}{!starts.length&&<div className={`free-period ${occupied?'continuation':''}`}>{occupied?<span>同一门课程</span>:<span>—</span>}</div>}</div></div>;})}
    </div>}
    {!!otherWeekCourses.length&&<details className="other-week-disclosure" key={selected}><summary><span><strong>同星期的其他周安排</strong><small>{otherWeekCourses.length} 门课程 · 不在所选日期上课</small></span><Icon name="chevron" size={18}/></summary><div className="other-week-list"><p>以下安排属于星期{'一二三四五六日'[day]}的其他周。点选课程可查看具体周次。</p>{otherWeekCourses.map(c=>courseCard(c,true))}</div></details>}
    </>}
    <p className="day-end">课表与教材，安心留在本机。<span>DOLPHIN CALENDAR</span></p>
    </div>
    {visible&&actionsHost&&createPortal(<div className="floating-actions"><div>{settings.showNavigation&&current&&<button className="nav-fab" aria-label="导航课程" title={`导航到${current.name}`} onClick={()=>navigate(current)}><Icon name="navigate" size={25}/></button>}</div></div>,actionsHost)}
    {calendarOpen&&<CalendarPicker selected={selected} schedule={schedule} onSelect={selectDate} onClose={()=>setCalendarOpen(false)} holidayFor={holidayFor}/>}
  </div>;
}
