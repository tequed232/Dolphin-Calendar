import {courseDates,type Schedule} from '../lib/model';

/** This is only a display index; course dates still come from the existing model. */
export function courseDateIndex(schedule:Schedule){
 const dates=new Set<string>();
 for(const course of schedule.courses)if(course.start>=1&&course.end<=schedule.periods.length){
  for(const date of courseDates(course,schedule))dates.add(date);
 }
 return [...dates].sort();
}
export function courseDateSuggestions(dates:string[],selected:string){
 let from=0,to=dates.length;
 while(from<to){const middle=(from+to)>>>1;if(dates[middle]<=selected)from=middle+1;else to=middle;}
 return {first:dates[0],next:dates[from]};
}
