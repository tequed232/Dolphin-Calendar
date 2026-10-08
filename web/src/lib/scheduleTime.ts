import {parseDate,weekOf,type Period,type Course,type RestTime} from './model';
export const MAX_PERIODS=24;
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function minutes(value:string){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('时间格式应为 HH:mm');const [h,m]=value.split(':').map(Number);return h*60+m;}
export type TimePosition={section:number;phase:'lesson'|'break';progress:number;nextSection?:number};
/** Map the local clock to a lesson or its real gap, independently of either layout. */
export function currentTimePosition(periods:Period[],now:Date):TimePosition|undefined{
 const time=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 const timed=periods.flatMap((period,index)=>{try{const start=minutes(period.start),end=minutes(period.end);return end>start?[{section:index+1,start,end}]:[];}catch{return [];}});
 for(let i=0;i<timed.length;i++){
  const period=timed[i],next=timed[i+1];
  if(time>=period.start&&(time<period.end||!next&&time===period.end))return {section:period.section,phase:'lesson',progress:(time-period.start)/(period.end-period.start)};
  if(next&&time>=period.end&&time<next.start)return {section:period.section,phase:'break',progress:(time-period.end)/(next.start-period.end),nextSection:next.section};
 }
}
/** Imported times may omit the hour's leading zero; stored times always use HH:mm. */
export function normalizeClock(value:unknown){const text=String(value??'').normalize('NFKC').trim().replace(/^(\d{1,2}:\d{2}):00$/,'$1').replace(/^(\d):/,'0$1:');minutes(text);return text;}
/** Shared by JSON, CSV and Excel. A combined range must agree with separate columns. */
export function importedTime(value:unknown):{start:string;end:string}|undefined{
 const p=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const pick=(...keys:string[])=>keys.map(key=>p[key]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
 const from=pick('startTime','timeStart','上课时间','开始时间','start'),to=pick('endTime','timeEnd','下课时间','结束时间','end');
 const range=typeof value==='string'?value:pick('timeRange','time','时间段','时间','上课下课时间');
 let combined:{start:string;end:string}|undefined;
 if(range!==undefined){const match=String(range).normalize('NFKC').trim().match(/^(\d{1,2}:\d{2}(?::00)?)\s*(?:-|–|—|~|至|到)\s*(\d{1,2}:\d{2}(?::00)?)$/);if(!match)throw new Error('时间段应为 HH:mm–HH:mm，如 08:00–08:45');combined={start:normalizeClock(match[1]),end:normalizeClock(match[2])};}
 if(from===undefined&&to===undefined&&!combined)return;
 if((from===undefined||to===undefined)&&!combined)throw new Error('上课时间和下课时间必须同时填写');
 const start=from===undefined?combined!.start:normalizeClock(from),end=to===undefined?combined!.end:normalizeClock(to);
 if(combined&&(combined.start!==start||combined.end!==end))throw new Error('时间段与上课 / 下课时间不一致');
 if(start>=end)throw new Error('下课时间必须晚于上课时间，且不能跨越午夜');
 return {start,end};
}
export function restLabel(value:unknown){const text=String(value??'').normalize('NFKC').trim();if(/^(?:午休|午间休息|午餐|lunch(?:\s*break)?)$/i.test(text))return '午休';if(/^(?:课间|休息|break|recess)$/i.test(text))return '休息';if(/^(?:晚休|晚餐|dinner(?:\s*break)?)$/i.test(text))return '晚休';return '';}
/** Rest records live with the lesson preceding their gap; they never consume a section. */
export function applyRestTimes(periods:Period[],rests:RestTime[]):Period[]{
 const result=periods.map(p=>({...p})),provided=new Map<number,RestTime>();
 for(const rest of rests){
  minutes(rest.start);minutes(rest.end);if(rest.start>=rest.end)throw new Error(`${rest.label}的结束时间必须晚于开始时间`);
  const index=result.findIndex((p,i)=>p.end&&result[i+1]?.start&&p.end<=rest.start&&result[i+1].start>=rest.end);
  if(index<0)throw new Error(`${rest.label} ${rest.start}–${rest.end} 不在两节课之间，或与课程时间重叠；请提供午休前后的完整课时`);
  const old=provided.get(index);
  if(old&&JSON.stringify(old)!==JSON.stringify(rest))throw new Error(`第 ${index+1} 节后的休息时间存在冲突`);
  result[index].breakAfter=rest;provided.set(index,rest);
 }
 return result;
}
/** All screens derive the same gaps from Schedule.periods; no independent lunch state. */
export function periodRest(periods:Period[],index:number):RestTime|undefined{
 const p=periods[index],next=periods[index+1];if(!p?.end||!next?.start||p.end>=next.start)return;
 if(p.breakAfter&&p.breakAfter.start>=p.end&&p.breakAfter.end<=next.start)return p.breakAfter;
 const gap=minutes(next.start)-minutes(p.end);if(gap<45)return;
 const label=p.end<'14:00'&&next.start>'11:00'?'午休':p.end>='16:00'&&next.start<='20:00'?'晚休':'休息';
 return {label,start:p.end,end:next.start};
}
/** Remove only obsolete imported gap annotations when lesson times or count change. */
export function retainRestTimes(periods:Period[]){return periods.map((p,i)=>{if(!p.breakAfter||p.breakAfter.start>=p.end&&periods[i+1]&&p.breakAfter.end<=periods[i+1].start)return p;const {breakAfter,...period}=p;return period;});}
export function clock(value:number){if(!Number.isInteger(value)||value<0||value>=1440)throw new Error('上课时间不能跨越午夜，请调整课时或课间');return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
export function validatePeriods(periods:Period[]){if(!periods.length||periods.length>MAX_PERIODS)throw new Error('课程节数应为 1–24');periods.forEach((p,i)=>{if(minutes(p.start)>=minutes(p.end))throw new Error(`第 ${i+1} 节的起止时间无效`);if(i&&minutes(p.start)<minutes(periods[i-1].end))throw new Error('节次时间不能重叠或倒序');if(p.breakAfter){minutes(p.breakAfter.start);minutes(p.breakAfter.end);if(p.breakAfter.start>=p.breakAfter.end||p.breakAfter.start<p.end||!periods[i+1]||p.breakAfter.end>periods[i+1].start)throw new Error(`第 ${i+1} 节后的${p.breakAfter.label}与课程时间冲突，请重新导入或调整休息前后的课时`);}});return periods;}
export function generatePeriods(count:number,first='08:00',duration=45,breakMinutes=10):Period[]{
 if(!Number.isInteger(count)||count<1||count>MAX_PERIODS)throw new Error('课程节数应为 1–24');
 if(!Number.isInteger(duration)||duration<1||!Number.isInteger(breakMinutes)||breakMinutes<0)throw new Error('课时必须为正整数，课间不能为负数');
 const begin=minutes(first);return validatePeriods(Array.from({length:count},(_,i)=>({start:clock(begin+i*(duration+breakMinutes)),end:clock(begin+i*(duration+breakMinutes)+duration)})));
}
/** Apply only supplied clock settings, retaining each existing duration and gap otherwise. */
export function retimePeriods(periods:Period[],first=periods[0]?.start,duration?:number,breakMinutes?:number):Period[]{
 validatePeriods(periods);
 if(duration!==undefined&&(!Number.isInteger(duration)||duration<1))throw new Error('课时必须为正整数');
 if(breakMinutes!==undefined&&(!Number.isInteger(breakMinutes)||breakMinutes<0))throw new Error('课间不能为负数');
 let next=minutes(first);
 return validatePeriods(retainRestTimes(periods.map((period,i)=>{
  if(i)next+=breakMinutes??minutes(period.start)-minutes(periods[i-1].end);
  const start=next;next+=duration??minutes(period.end)-minutes(period.start);
  const rest=period.breakAfter,delta=start-minutes(period.start);
  return {...period,start:clock(start),end:clock(next),...(rest?{breakAfter:{...rest,start:clock(minutes(rest.start)+delta),end:clock(minutes(rest.end)+delta)}}:{})};
 })));
}
export function resizePeriods(periods:Period[],count:number):Period[]{
 if(!Number.isInteger(count)||count<1||count>MAX_PERIODS)throw new Error('课程节数应为 1–24');
 if(count<=periods.length)return retainRestTimes(periods.slice(0,count));
 const result=periods.map(p=>({...p}));if(!result.length)return generatePeriods(count);
 const last=result.at(-1)!, remaining=count-result.length, available=1439-minutes(last.end);
 // Preserve existing times, fitting additional periods into the remaining day when necessary.
 const gap=Math.min(10,Math.max(0,Math.floor(available/(remaining*4))));
 const duration=Math.min(minutes(last.end)-minutes(last.start),Math.floor(available/remaining)-gap);
 if(duration<1)throw new Error('当天已没有可用时间，请先自动顺延或提前末节时间');
 for(let i=0;i<remaining;i++){const start=minutes(result.at(-1)!.end)+gap;result.push({start:clock(start),end:clock(start+duration)});}
 return validatePeriods(result);
}
export function coursesConflict(a:Course,b:Course,startDate?:string){
 if(a.id===b.id||a.day!==b.day||a.start>b.end||a.end<b.start)return false;
 if(a.specificDate&&b.specificDate)return a.specificDate===b.specificDate;
 if(startDate&&a.specificDate)return b.weeks.includes(weekOf(parseDate(a.specificDate),startDate));
 if(startDate&&b.specificDate)return a.weeks.includes(weekOf(parseDate(b.specificDate),startDate));
 return a.weeks.some(w=>b.weeks.includes(w));
}
