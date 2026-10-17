import type {Schedule} from './model';
import {coursesConflict} from './scheduleTime';

/** Presentation only: never alter, merge or discard imported courses. */
export function previewConflicts(schedule:Schedule){
 const result:{id:string;label:string}[]=[];
 for(let i=0;i<schedule.courses.length;i++)for(let j=i+1;j<schedule.courses.length;j++){
  const a=schedule.courses[i],b=schedule.courses[j];
  if(coursesConflict(a,b,schedule.term.startDate)){
   result.push({id:JSON.stringify([a.id,b.id]),label:`${a.name} / ${b.name}`});
   if(result.length===20)return result;
  }
 }
 return result;
}
