import {coursesOn,dateKey,type Schedule} from './model';
export type ViewFocus={date:string;sectionIndex:number;courseId?:string;source:'selection'|'viewport'|'section'|'date'|'initial'};
export function initialHomeFocus(schedule:Schedule,now:Date):ViewFocus{
 const date=dateKey(now),time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 const section=schedule.periods.findIndex(period=>period.end&&period.end>time);
 const course=coursesOn(schedule,now).find(course=>schedule.periods[course.end-1]?.end>time);
 return {date,sectionIndex:course?.start??(section<0?Math.max(1,schedule.periods.length):section+1),courseId:course?.id,source:'initial'};
}
