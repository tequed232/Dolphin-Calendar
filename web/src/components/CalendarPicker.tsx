import {useEffect,useId,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Dialog} from './Dialog';
import {Icon} from './Icon';
import {ChoiceSelect} from './ChoiceSelect';
import {addDays,coursesOn,dateKey,parseDate,type Schedule} from '../lib/model';
import type {HolidayMark} from '../lib/holidays';

const firstMonth=(date:Date)=>new Date(date.getFullYear(),date.getMonth(),1,12);
const monthAt=(month:Date,amount:number)=>new Date(month.getFullYear(),month.getMonth()+amount,1,12);
const allowed=(month:Date)=>month.getFullYear()>=1900&&month.getFullYear()<=9999;
type Drag={id:number;x:number;y:number;width:number;gestureWidth?:number;lastX:number;lastTime:number;speed:number;axis:'pending'|'horizontal'|'vertical';offset:number};
type Motion={frame:number;nextFrame:number;timer:number;busy:boolean};
function stopMotion(state:Motion){cancelAnimationFrame(state.frame);cancelAnimationFrame(state.nextFrame);window.clearTimeout(state.timer);state.busy=false;}

export function CalendarPicker({selected,schedule,onSelect,onClose,holidayFor,purpose='courses'}:{selected:string;schedule:Schedule;onSelect:(date:string)=>void;onClose:()=>void;holidayFor?:(date:string)=>HolidayMark|undefined;purpose?:'courses'|'term'|'import'}){
  const initial=parseDate(selected),[month,setMonth]=useState(()=>firstMonth(initial)),[jump,setJump]=useState(false),[year,setYear]=useState(String(initial.getFullYear()));
  const [offset,setOffset]=useState(0),[animating,setAnimating]=useState(false),[dragging,setDragging]=useState(false);
  const [yearOffset,setYearOffset]=useState(0),[yearAnimating,setYearAnimating]=useState(false),[yearDragging,setYearDragging]=useState(false);
  const drag=useRef<Drag|null>(null),yearDrag=useRef<Drag|null>(null),animation=useRef<Motion>({frame:0,nextFrame:0,timer:0,busy:false}),yearAnimation=useRef<Motion>({frame:0,nextFrame:0,timer:0,busy:false}),suppressClickUntil=useRef(0),hintId=useId();
  const today=dateKey(new Date()),choosingTerm=purpose!=='courses',monthLabel=`${month.getFullYear()}年${month.getMonth()+1}月`;
  useEffect(()=>()=>{stopMotion(animation.current);stopMotion(yearAnimation.current);},[]);
  function settle(from:number,kind:'month'|'year'='month'){
    const motion=kind==='month'?animation.current:yearAnimation.current,setPosition=kind==='month'?setOffset:setYearOffset,setMotion=kind==='month'?setAnimating:setYearAnimating;
    stopMotion(motion);(kind==='month'?setDragging:setYearDragging)(false);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(from)<.002){setMotion(false);setPosition(0);return;}
    // Commit the incoming page between frames while retaining the finger's visual position.
    setMotion(false);setPosition(from);motion.busy=true;
    motion.frame=requestAnimationFrame(()=>{motion.nextFrame=requestAnimationFrame(()=>{
      setMotion(true);setPosition(0);motion.timer=window.setTimeout(()=>{setMotion(false);motion.busy=false;},200);
    });});
  }
  function selectMonth(next:Date,from=0){if(!allowed(next))return;stopMotion(yearAnimation.current);setYearAnimating(false);setYearOffset(0);setMonth(next);setYear(String(next.getFullYear()));settle(from);}
  function selectYear(value:number,from=0){const next=new Date(value,month.getMonth(),1,12);if(!allowed(next))return;stopMotion(animation.current);setAnimating(false);setOffset(0);setMonth(next);setYear(String(value));settle(from,'year');}
  function moveYear(amount:number){selectYear(month.getFullYear()+amount,Math.sign(amount));}
  function move(amount:number){const next=monthAt(month,amount);if(allowed(next))selectMonth(next,Math.abs(amount)===1?Math.sign(amount):0);}
  function validYear(){const value=Number(year);return Number.isInteger(value)&&value>=1900&&value<=9999?value:month.getFullYear();}
  function jumpYear(){selectYear(validYear());}
  function startDrag(event:ReactPointerEvent<HTMLDivElement>){
    if(animation.current.busy||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
    const box=event.currentTarget.getBoundingClientRect();
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,width:box.width,lastX:event.clientX,lastTime:event.timeStamp,speed:0,axis:'pending',offset:0};
  }
  function updateDrag(event:ReactPointerEvent<HTMLDivElement>){
    const state=drag.current;if(!state||state.id!==event.pointerId)return;
    const x=event.clientX-state.x,y=event.clientY-state.y;
    if(state.axis==='pending'){
      if(Math.abs(y)>8&&Math.abs(y)>=Math.abs(x)){state.axis='vertical';return;}
      if(Math.abs(x)<=8||Math.abs(x)<Math.abs(y)*1.15)return;
      state.axis='horizontal';event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);suppressClickUntil.current=performance.now()+400;
    }
    if(state.axis!=='horizontal')return;
    event.preventDefault();const elapsed=event.timeStamp-state.lastTime;
    if(elapsed>0)state.speed=(event.clientX-state.lastX)/elapsed;
    state.lastX=event.clientX;state.lastTime=event.timeStamp;
    const direction=x<0?1:-1,bounded=!allowed(monthAt(month,direction));
    state.offset=Math.max(-1,Math.min(1,x/state.width))*(bounded?0.22:1);setOffset(state.offset);
  }
  function finishDrag(event:ReactPointerEvent<HTMLDivElement>,cancel=false){
    const state=drag.current;if(!state||state.id!==event.pointerId)return;drag.current=null;
    if(state.axis!=='horizontal')return;
    suppressClickUntil.current=performance.now()+400;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const direction=state.offset<0?1:-1,next=monthAt(month,direction),distance=Math.abs(event.clientX-state.x);
    const quick=distance>=24&&Math.abs(state.speed)>.45&&event.timeStamp-state.lastTime<100;
    if(!cancel&&allowed(next)&&(Math.abs(state.offset)>=.2||quick))selectMonth(next,state.offset+direction);
    else settle(state.offset);
  }
  function startYearDrag(event:ReactPointerEvent<HTMLDivElement>){
    if((event.target as HTMLElement).closest('input,button')||yearAnimation.current.busy||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
    const box=event.currentTarget.querySelector('.calendar-year-window')!.getBoundingClientRect();yearDrag.current={id:event.pointerId,x:event.clientX,y:event.clientY,width:box.width,gestureWidth:event.currentTarget.getBoundingClientRect().width,lastX:event.clientX,lastTime:event.timeStamp,speed:0,axis:'pending',offset:0};
  }
  function updateYearDrag(event:ReactPointerEvent<HTMLDivElement>){
    const state=yearDrag.current;if(!state||state.id!==event.pointerId)return;
    const x=event.clientX-state.x,y=event.clientY-state.y;
    if(state.axis==='pending'){
      if(Math.abs(y)>8&&Math.abs(y)>=Math.abs(x)){state.axis='vertical';return;}
      if(Math.abs(x)<=8||Math.abs(x)<Math.abs(y)*1.15)return;
      state.axis='horizontal';event.currentTarget.setPointerCapture(event.pointerId);setYearDragging(true);
    }
    if(state.axis!=='horizontal')return;event.preventDefault();const elapsed=event.timeStamp-state.lastTime;
    if(elapsed>0)state.speed=(event.clientX-state.lastX)/elapsed;
    state.lastX=event.clientX;state.lastTime=event.timeStamp;
    const next=month.getFullYear()+(x<0?1:-1),bounded=next<1900||next>9999;
    state.offset=Math.max(-1,Math.min(1,x/state.width))*(bounded?0.22:1);setYearOffset(state.offset);
  }
  function finishYearDrag(event:ReactPointerEvent<HTMLDivElement>,cancel=false){
    const state=yearDrag.current;if(!state||state.id!==event.pointerId)return;yearDrag.current=null;if(state.axis!=='horizontal')return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const direction=state.offset<0?1:-1,next=month.getFullYear()+direction,distance=Math.abs(event.clientX-state.x),quick=distance>=24&&Math.abs(state.speed)>.45&&event.timeStamp-state.lastTime<100;
    if(!cancel&&next>=1900&&next<=9999&&(distance/(state.gestureWidth??state.width)>=.2||quick))selectYear(next,state.offset+direction);
    else settle(state.offset,'year');
  }
  function panel(panelMonth:Date,current:boolean){
    const first=firstMonth(panelMonth),start=addDays(first,-((first.getDay()+6)%7));
    return <div className={current?'calendar-grid':'calendar-preview-grid'} role={current?'group':undefined} aria-label={current?'月历日期':undefined} aria-hidden={current?undefined:true} inert={current?undefined:true}>{Array.from({length:42},(_,i)=>addDays(start,i)).map(day=>{
      const key=dateKey(day),count=choosingTerm?0:coursesOn(schedule,day).length,holiday=holidayFor?.(key),classes=`${current?'calendar-day':'calendar-preview-day'} ${day.getMonth()!==panelMonth.getMonth()?'adjacent':''} ${key===selected?'picked':''} ${holiday?'holiday-date holiday-'+holiday.kind:''}`;
      const contents=<><span>{day.getDate()}</span><i className={count?'has-course':''}/>{holiday&&<b className={`holiday-mark ${holiday.kind}`} aria-hidden="true">{holiday.label}</b>}</>;
      return current?<button key={key} data-date={key} title={holiday?.description} disabled={!allowed(day)} aria-label={`${key}${choosingTerm?'':count?`，${count} 门课程`:'，无课程'}${holiday?'，'+holiday.description:''}`} aria-pressed={key===selected} aria-current={key===today?'date':undefined} className={classes} onClick={()=>onSelect(key)}>{contents}</button>:<div key={key} className={classes} data-today={key===today||undefined}>{contents}</div>;
    })}</div>;
  }
  return <Dialog open title={choosingTerm?'学期开始日期':'选择日期'} onClose={onClose}>
    <div className="calendar-picker">
      <div className="calendar-controls">
        <p className="calendar-explainer">{purpose==='import'?'点选开学日期，确认导入后生效。':choosingTerm?'点选开学日期，点击“保存课表设置”后生效。':'点选日期，查看那一天的课程。圆点表示当天有课。'}</p>
        <div className="calendar-toolbar"><button className="icon-button" aria-label="上个月" disabled={!allowed(monthAt(month,-1))} onClick={()=>move(-1)}><Icon name="back"/></button><button className="calendar-month" aria-expanded={jump} onClick={()=>setJump(v=>!v)}>{monthLabel}<Icon name="chevron" size={17}/></button><button className="icon-button" aria-label="下个月" disabled={!allowed(monthAt(month,1))} onClick={()=>move(1)}><Icon name="next"/></button></div>
        {jump&&<div className="calendar-jump"><div className="field calendar-year-field"><span>年份</span>
          <div className="calendar-year-swipe" tabIndex={0} role="group" aria-label="滑动切换年份" data-dragging={yearDragging||undefined} onPointerDown={startYearDrag} onPointerMove={updateYearDrag} onPointerUp={e=>finishYearDrag(e)} onPointerCancel={e=>finishYearDrag(e,true)} onLostPointerCapture={e=>{if(e.target===e.currentTarget&&yearDrag.current?.id===e.pointerId)finishYearDrag(e,true);}} onKeyDown={e=>{if(!(e.target as HTMLElement).closest('input,button')&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();moveYear(e.key==='ArrowLeft'?-1:1);}}}>
            <div className="calendar-year-row"><button className="icon-button" aria-label="上一年" disabled={month.getFullYear()===1900} onClick={()=>moveYear(-1)}><Icon name="back"/></button>
              <div className="calendar-year-window"><div className="calendar-year-track" data-animating={yearAnimating||undefined} style={{transform:`translate3d(${(-1+yearOffset)*100/3}%,0,0)`}}>{[-1,0,1].map(amount=><div className="calendar-year-slide" key={amount} aria-hidden={amount!==0||undefined}>{amount===0?<input type="number" min={1900} max={9999} aria-label="日历年份" value={year} onChange={e=>setYear(e.target.value)} onBlur={jumpYear} onKeyDown={e=>{if(e.key==='Enter'){jumpYear();e.currentTarget.blur();}}}/>:<strong>{month.getFullYear()+amount>=1900&&month.getFullYear()+amount<=9999?month.getFullYear()+amount:'—'}</strong>}</div>)}</div></div>
              <button className="icon-button" aria-label="下一年" disabled={month.getFullYear()===9999} onClick={()=>moveYear(1)}><Icon name="next"/></button></div>
            <small className="calendar-year-hint">左右滑动，点数字输入</small>
          </div>
        </div><ChoiceSelect label="月份" value={String(month.getMonth())} options={Array.from({length:12},(_,i)=>({value:String(i),label:`${i+1} 月`}))} onChange={value=>selectMonth(new Date(validYear(),Number(value),1,12))}/>
        </div>}
        <p className="calendar-gesture-hint" id={hintId}>左右滑动切换月份，点击年月快速跳转。</p>
      </div>
      <div className="calendar-dates">
        <div className="calendar-weekdays" aria-hidden="true">{'一二三四五六日'.split('').map(day=><span key={day}>{day}</span>)}</div>
        <div className="calendar-viewport" tabIndex={0} role="group" aria-label="滑动切换月份" aria-describedby={hintId} data-dragging={dragging||undefined} onPointerDown={startDrag} onPointerMove={updateDrag} onPointerUp={e=>finishDrag(e)} onPointerCancel={e=>finishDrag(e,true)} onLostPointerCapture={e=>{if(e.target===e.currentTarget&&drag.current?.id===e.pointerId)finishDrag(e,true);}} onClickCapture={e=>{if(performance.now()<suppressClickUntil.current){e.preventDefault();e.stopPropagation();}}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();e.currentTarget.focus();const amount=e.key==='ArrowLeft'||e.key==='PageUp'?-1:1;move(amount*(e.shiftKey?12:1));}}}>
          <div className="calendar-track" data-animating={animating||undefined} style={{transform:`translate3d(${(-1+offset)*100/3}%,0,0)`}}>{panel(monthAt(month,-1),false)}{panel(month,true)}{panel(monthAt(month,1),false)}</div>
        </div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{monthLabel}</span>
      </div>
      <div className="calendar-footer">{choosingTerm?<span>点选后返回编辑</span>:<span><i/>有课日期</span>}<button className="secondary" onClick={()=>onSelect(today)}>{choosingTerm?'使用今天':'回到今天'}</button></div>
    </div>
  </Dialog>;
}
