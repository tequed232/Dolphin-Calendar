import type {Schedule,Course,Period} from './model';
import {resizePeriods,minutes} from './scheduleTime';
export type ImportedPeriodTime={first:number;last:number;start:string;end:string;row:number;single:boolean};
export function applyPeriodTimes(current:Schedule,courses:Course[],times:ImportedPeriodTime[],notes:string[]):Period[]{
 if(!times.length)return resizePeriods(current.periods,Math.max(current.periods.length,...courses.map(course=>course.end)));
 const boundaries=new Map<number,{start?:{value:string;row:number};end?:{value:string;row:number}}>();
 function assign(index:number,key:'start'|'end',value:string,row:number){
  const entry=boundaries.get(index)??{},previous=entry[key];
  if(previous&&previous.value!==value)throw new Error(`第 ${row} 行与第 ${previous.row} 行冲突：第 ${index} 节${key==='start'?'上课':'下课'}时间分别为 ${value} 和 ${previous.value}`);
  entry[key]={value,row};boundaries.set(index,entry);
 }
 for(const time of times){assign(time.first,'start',time.start,time.row);assign(time.last,'end',time.end,time.row);}
 const singles=new Set(times.filter(time=>time.single).map(time=>time.first)),lastSingle=Math.max(0,...singles);
 const complete=lastSingle>0&&Array.from({length:lastSingle},(_,i)=>i+1).every(index=>singles.has(index));
 const count=complete?lastSingle:Math.max(current.periods.length,...courses.map(course=>course.end),...boundaries.keys());
 if(complete&&courses.some(course=>course.end>count))throw new Error(`完整时间表只有 ${count} 节，但课程安排超出此范围；请补齐逐节时间或修正课程节次`);
 const periods=Array.from({length:count},(_,i)=>{
  const entry=boundaries.get(i+1),old=current.periods[i];
  if(!old&&(!entry?.start||!entry.end))throw new Error(`第 ${i+1} 节没有完整起止时间；新增节次需逐节填写，不能推算连堂中间时间`);
  return {...old,start:entry?.start?.value??old.start,end:entry?.end?.value??old.end};
 });
 periods.forEach((p,i)=>{if(p.breakAfter&&(p.breakAfter.start<p.end||!periods[i+1]||p.breakAfter.end>periods[i+1].start))delete p.breakAfter;});
 for(let i=0;i<periods.length;i++){
  const period=periods[i],entry=boundaries.get(i+1),source=entry?`第 ${[...new Set([entry.start?.row,entry.end?.row].filter(Boolean))].join(' / ')} 行：`:'';
  if(minutes(period.start)>=minutes(period.end))throw new Error(`${source}应用后第 ${i+1} 节的起止时间无效；请补齐该节的上课 / 下课时间`);
  if(i&&minutes(period.start)<minutes(periods[i-1].end)){
   const previous=boundaries.get(i),rows=[entry?.start?.row,entry?.end?.row,previous?.start?.row,previous?.end?.row].filter(Boolean);
   throw new Error(`${rows.length?`第 ${[...new Set(rows)].join(' / ')} 行：`:''}应用后第 ${i}–${i+1} 节时间重叠或倒序；未提供的节次沿用当前时间，请逐节核对`);
  }
 }
 notes.push(complete?`文件完整提供第 1–${count} 节时间，每日课程节数设为 ${count} 节。`:'文件仅提供部分节次时间，其余节次时间保留当前配置。');
 if(times.some(time=>time.first!==time.last))notes.push('连堂时间只更新开始节次的上课时间和结束节次的下课时间，中间节次沿用当前配置，未作推算。');
 return periods;
}
