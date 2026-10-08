import {addDays,coursesOn,dateKey,monday,parseDate,type Period,type Schedule} from './model';
import {minutes} from './scheduleTime';
/** Lesson spans follow section boundaries; long breaks occupy their own trailing space. */
export function gridRows(periods:Period[]){
 const time=(value:string,fallback:number)=>{try{return minutes(value);}catch{return fallback;}};
 return periods.map((period,i)=>{
  const start=time(period.start,480+i*55),end=time(period.end,start+45),gap=i+1<periods.length?Math.max(0,time(periods[i+1].start,end+10)-end):0;
  const lesson=Math.max(84,Math.min(120,(end-start)*1.45)),breakHeight=gap?Math.max(4,Math.min(44,gap*.4)):0;
  return {lesson,breakHeight,height:lesson+breakHeight,breakMinutes:gap};
 });
}
/** A weekday selection never filters the weekly occurrence set. */
export function weekOccurrences(schedule:Schedule,weekDate:string){
 const start=monday(parseDate(weekDate));
 return Array.from({length:7},(_,day)=>{const date=addDays(start,day);return coursesOn(schedule,date).map(course=>({course,date:dateKey(date)}));}).flat();
}
export function closestSection(points:number[],original:number,delta:number){
 const target=points[original-1]+delta;let index=0;
 for(let i=1;i<points.length;i++)if(Math.abs(points[i]-target)<Math.abs(points[index]-target))index=i;
 return index+1;
}
