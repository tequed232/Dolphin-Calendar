import {useState} from 'react';
import {Dialog} from './Dialog';
import {Icon} from './Icon';
import {ChoiceSelect} from './ChoiceSelect';
import {addDays,coursesOn,dateKey,parseDate,type Schedule} from '../lib/model';
import type {HolidayMark} from '../lib/holidays';

export function CalendarPicker({selected,schedule,onSelect,onClose,holidayFor,purpose='courses'}:{selected:string;schedule:Schedule;onSelect:(date:string)=>void;onClose:()=>void;holidayFor?:(date:string)=>HolidayMark|undefined;purpose?:'courses'|'term'|'import'}){
  const initial=parseDate(selected),[month,setMonth]=useState(()=>new Date(initial.getFullYear(),initial.getMonth(),1,12)),[jump,setJump]=useState(false),[year,setYear]=useState(String(initial.getFullYear()));
  const first=new Date(month.getFullYear(),month.getMonth(),1,12),start=addDays(first,-((first.getDay()+6)%7)),today=dateKey(new Date());
  const days=Array.from({length:42},(_,i)=>addDays(start,i));
  function move(amount:number){const next=new Date(month.getFullYear(),month.getMonth()+amount,1,12);if(next.getFullYear()>=1900&&next.getFullYear()<=9999){setMonth(next);setYear(String(next.getFullYear()));}}
  function validYear(){const value=Number(year);return Number.isInteger(value)&&value>=1900&&value<=9999?value:month.getFullYear();}
  function jumpYear(){const value=validYear();setYear(String(value));setMonth(new Date(value,month.getMonth(),1,12));}
  const choosingTerm=purpose!=='courses';
  return <Dialog open title={choosingTerm?'学期开始日期':'选择日期'} onClose={onClose}>
    <p className="calendar-explainer">{purpose==='import'?'点选开学日期，确认导入后生效。':choosingTerm?'点选开学日期，点击“保存学期与时间”后生效。':'点选日期，查看那一天的课程。圆点表示当天有课。'}</p>
    <div className="calendar-toolbar"><button className="icon-button" aria-label="上个月" disabled={month.getFullYear()===1900&&month.getMonth()===0} onClick={()=>move(-1)}><Icon name="back"/></button><button className="calendar-month" aria-expanded={jump} onClick={()=>setJump(v=>!v)}>{month.getFullYear()}年{month.getMonth()+1}月<Icon name="chevron" size={17}/></button><button className="icon-button" aria-label="下个月" disabled={month.getFullYear()===9999&&month.getMonth()===11} onClick={()=>move(1)}><Icon name="next"/></button></div>
    {jump&&<div className="calendar-jump"><label className="field">年份<input type="number" min={1900} max={9999} aria-label="日历年份" value={year} onChange={e=>setYear(e.target.value)} onBlur={jumpYear} onKeyDown={e=>{if(e.key==='Enter'){jumpYear();e.currentTarget.blur();}}}/></label><ChoiceSelect label="月份" value={String(month.getMonth())} options={Array.from({length:12},(_,i)=>({value:String(i),label:`${i+1} 月`}))} onChange={value=>{const targetYear=validYear();setYear(String(targetYear));setMonth(new Date(targetYear,Number(value),1,12));}}/></div>}
    <div className="calendar-weekdays" aria-hidden="true">{'一二三四五六日'.split('').map(day=><span key={day}>{day}</span>)}</div>
    <div className="calendar-grid" role="group" aria-label="月历日期">{days.map(day=>{const key=dateKey(day),count=choosingTerm?0:coursesOn(schedule,day).length,holiday=holidayFor?.(key);return <button key={key} data-date={key} title={holiday?.description} disabled={day.getFullYear()<1900||day.getFullYear()>9999} aria-label={`${key}${choosingTerm?'':count?`，${count} 门课程`:'，无课程'}${holiday?'，'+holiday.description:''}`} aria-pressed={key===selected} aria-current={key===today?'date':undefined} className={`calendar-day ${day.getMonth()!==month.getMonth()?'adjacent':''} ${key===selected?'picked':''} ${holiday?'holiday-date holiday-'+holiday.kind:''}`} onClick={()=>onSelect(key)}><span>{day.getDate()}</span><i className={count?'has-course':''}/>{holiday&&<b className={`holiday-mark ${holiday.kind}`} aria-hidden="true">{holiday.label}</b>}</button>;})}</div>
    <div className="calendar-footer">{choosingTerm?<span>点选后返回编辑</span>:<span><i/>有课日期</span>}<button className="secondary" onClick={()=>onSelect(today)}>{choosingTerm?'使用今天':'回到今天'}</button></div>
  </Dialog>;
}
