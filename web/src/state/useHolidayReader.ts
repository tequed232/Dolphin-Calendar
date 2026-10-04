import {useEffect,useRef,useState} from 'react';
import type {AppData,HolidayCalendar} from '../lib/model';
import {normalizeHolidayDays,sameCalendarIds} from '../lib/holidays';
import {isNative,native,type NativeMessage} from '../lib/native';

type Pending={action:'holidayCalendars'|'calendarHolidays';calendarIds:string[];from:string;to:string;saving?:boolean};
type UpdateData=(fn:(previous:AppData)=>AppData)=>Promise<void>;

/** AppProvider owns this reader so leaving the settings page never discards a pending result. */
export function useHolidayReader(data:AppData,update:UpdateData){
  const [calendars,setCalendars]=useState<HolidayCalendar[]|null>(null),[busy,setBusy]=useState(false);
  const [status,setStatus]=useState('选择系统日历中的节假日来源，再读取需要的年份。'),[failed,setFailed]=useState(false);
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const pending=useRef<Pending|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),current=useRef({data,update});current.current={data,update};
  function report(message:string,error=false){setStatus(message);setFailed(error);}
  function finish(request:Pending){if(pending.current!==request)return;clearTimeout(timer.current);pending.current=null;setBusy(false);}
  useEffect(()=>{
    const onResult=(event:Event)=>{
      const result=(event as CustomEvent<NativeMessage>).detail,request=pending.current;
      if(!request||request.saving||result.action!==request.action)return;
      // Every read response, including a failure, belongs to exactly the selected source set and range.
      if(request.action==='calendarHolidays'&&(!result.calendarIds||!sameCalendarIds(result.calendarIds,request.calendarIds)||result.from!==request.from||result.to!==request.to))return;
      if(!result.success||result.permission===false){finish(request);report(result.message||(result.permission===false?'未获得读取系统日历的权限；可重新选择来源并允许读取。':'系统日历读取失败，请稍后重试。'),true);return;}
      if(request.action==='holidayCalendars'){
        finish(request);
        if(!Array.isArray(result.calendars)){report('系统未返回日历来源，请重试。',true);return;}
        const choices=result.calendars.filter(item=>typeof item.id==='string'&&item.id.length>0&&typeof item.displayName==='string');
        setCalendars(choices);
        report(choices.length?'请选择确实包含节假日的日历，然后保存来源。建议来源仅供参考，需要你确认选择。':'系统日历没有可读的日历来源。请先在手机日历中添加或启用节假日日历，再重试。');return;
      }
      if(!Array.isArray(result.days)){finish(request);report('系统未返回节假日数据，已保留之前的缓存，请重试。',true);return;}
      if(!sameCalendarIds(current.current.data.holidayCalendarIds,request.calendarIds)){finish(request);report('日历来源已改变，请重新读取所选年份。');return;}
      // The provider has replied; saving remains busy, but is no longer governed by the read timeout.
      request.saving=true;clearTimeout(timer.current);
      const allDays=normalizeHolidayDays(result.days).filter(day=>day.date>=request.from&&day.date<=request.to),days=allDays.slice(0,2000);
      let evicted=false,matched=true;
      void current.current.update(previous=>{
        if(!sameCalendarIds(previous.holidayCalendarIds,request.calendarIds)){matched=false;return previous;}
        const matching=previous.holidayRanges.filter(range=>sameCalendarIds(range.calendarIds,request.calendarIds));
        const nextRanges=[...matching.filter(range=>!(range.from>=request.from&&range.to<=request.to)),{from:request.from,to:request.to,calendarIds:request.calendarIds}],keptRanges=nextRanges.slice(-6);
        evicted=nextRanges.length>6;
        const oldDays=previous.holidays.filter(day=>keptRanges.some(range=>day.date>=range.from&&day.date<=range.to)&&!(day.date>=request.from&&day.date<=request.to));
        return {...previous,holidays:[...oldDays,...days].slice(-12000),holidayRanges:keptRanges};
      }).then(()=>{
        finish(request);
        if(!matched){report('日历来源已改变，请重新读取所选年份。');return;}
        report((days.length?`已读取 ${request.from.slice(0,4)} 年：${new Set(days.map(day=>day.date)).size} 个标记日期，已保存到本机。`:`已读取 ${request.from.slice(0,4)} 年；所选来源没有提供这一年的节假日条目，不会推算休假或补课。`)+(evicted?' 已移除最早读取的年份缓存，只保留最近 6 次读取的年份。':'')+(allDays.length>2000?' 本次条目较多，保留前 2000 条标记。':''));
      }).catch(()=>{finish(request);report('节假日数据未能保存，之前的缓存已保留，请重试。',true);});
    };
    window.addEventListener('dolphin-holiday',onResult);
    return()=>{window.removeEventListener('dolphin-holiday',onResult);clearTimeout(timer.current);pending.current=null;};
  },[]);
  function request(action:Pending['action'],year=''){
    if(pending.current)return;
    if(!isNative()){report('请在 Android 安装版中读取系统日历。手机日历需要先提供节假日来源。');return;}
    const saved=current.current.data;
    if(action==='calendarHolidays'&&(!saved.holidayCalendarIds.length||!/^\d{4}$/.test(year)||Number(year)<1900||Number(year)>9999))return;
    const next={action,calendarIds:[...saved.holidayCalendarIds],from:`${year}-01-01`,to:`${year}-12-31`} as Pending;
    if(action==='calendarHolidays')setYear(year);
    pending.current=next;setBusy(true);report(action==='holidayCalendars'?'正在读取日历来源；首次使用请允许读取系统日历。':`正在读取 ${year} 年的节假日…`);
    timer.current=setTimeout(()=>{if(pending.current!==next)return;finish(next);report('系统日历暂未回复，请重试。之前的缓存已保留。',true);},25000);
    native(action,action==='calendarHolidays'?{calendarIds:next.calendarIds,from:next.from,to:next.to}:{});
  }
  async function saveSources(ids:string[]){
    if(!calendars||pending.current)return;
    const selected=calendars.filter(calendar=>ids.includes(calendar.id));
    try{await current.current.update(previous=>({...previous,holidayCalendarIds:selected.map(calendar=>calendar.id).sort(),holidaySourceNames:selected.map(calendar=>calendar.displayName)}));report(selected.length?'来源已保存，请读取需要的年份。':'未选择日历来源，日期标记将隐藏；可随时重新选择来源。');}catch{report('来源未能保存，请重试。',true);}
  }
  return {calendars,busy,status,failed,year,readCalendars:()=>request('holidayCalendars'),readYear:(year:string)=>request('calendarHolidays',year),saveSources};
}
