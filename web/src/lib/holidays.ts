import type {AppData,HolidayDay,HolidayKind,HolidayRange} from './model';

export type HolidayMark = {kind:HolidayKind;label:string;description:string;days:HolidayDay[]};
const labels:Record<HolidayKind,string>={rest:'休',makeup:'补',festival:'节'};
const names:Record<HolidayKind,string>={rest:'休假',makeup:'补课／补班',festival:'节日'};
const priority:Record<HolidayKind,number>={festival:0,rest:1,makeup:2};
export function sameCalendarIds(a:string[],b:string[]){return a.length===b.length&&[...a].sort().every((id,i)=>id===[...b].sort()[i]);}
export function validHolidayDate(value:unknown):value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day,12);
  return year>=1900&&year<=9999&&date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;
}
export function normalizeHolidayDays(value:unknown):HolidayDay[]{
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  return value.filter((day):day is HolidayDay=>!!day&&validHolidayDate(day.date)&&['rest','makeup','festival'].includes(day.kind)&&typeof day.title==='string'&&typeof day.source==='string').map(day=>({...day,title:day.title.trim().slice(0,180)||'未命名节日',source:day.source.trim().slice(0,180)||'系统日历'})).filter(day=>{const key=[day.date,day.kind,day.title,day.source].join('\0');if(seen.has(key))return false;seen.add(key);return true;});
}
export function normalizeHolidayRanges(value:unknown):HolidayRange[]{
  if(!Array.isArray(value))return [];
  return value.filter((range):range is HolidayRange=>!!range&&validHolidayDate(range.from)&&validHolidayDate(range.to)&&range.from<=range.to&&Array.isArray(range.calendarIds)&&range.calendarIds.length>0&&range.calendarIds.every((id:unknown)=>typeof id==='string'&&id.length>0)).map(range=>({...range,calendarIds:[...new Set(range.calendarIds)].sort()}));
}
export function holidayLookup(data:AppData){
  const marks=new Map<string,HolidayMark>();
  if(!data.settings.holidayMarkers||!data.holidayCalendarIds.length)return marks;
  const ranges=data.holidayRanges.filter(range=>sameCalendarIds(range.calendarIds,data.holidayCalendarIds));
  for(const day of data.holidays){
    if(!ranges.some(range=>day.date>=range.from&&day.date<=range.to))continue;
    const previous=marks.get(day.date),days=[...(previous?.days??[]),day],kind=days.reduce<HolidayKind>((a,b)=>priority[b.kind]>priority[a]?b.kind:a,'festival');
    marks.set(day.date,{kind,label:labels[kind],days,description:days.map(item=>`${names[item.kind]}：${item.title}（${item.source}）`).join('；')});
  }
  return marks;
}
