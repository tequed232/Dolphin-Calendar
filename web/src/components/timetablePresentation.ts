import type {Course} from '../lib/model';

export type PositionedCourse={course:Course;lane:number;lanes:number};
/** Pack intersecting section spans into presentation lanes; never change courses. */
export function layoutCourses(courses:Course[]){
 const positioned:PositionedCourse[]=[],group:PositionedCourse[]=[],ends:number[]=[];let groupEnd=0;
 function finishGroup(){for(const item of group)item.lanes=ends.length;positioned.push(...group);group.length=0;ends.length=0;}
 for(const course of [...courses].sort((a,b)=>a.start-b.start||a.end-b.end)){
  if(group.length&&course.start>groupEnd)finishGroup();
  const available=ends.findIndex(end=>end<course.start),lane=available<0?ends.length:available;
  ends[lane]=course.end;groupEnd=Math.max(groupEnd,course.end);group.push({course,lane,lanes:1});
 }
 finishGroup();return positioned;
}

/** Precompute each column once per occurrence change, not once per render. */
export function weekGridPresentation(occurrences:{course:Course;date:string}[],dayKeys:string[],periodCount:number){
 const columns=new Map(dayKeys.map(date=>[date,{courses:[] as Course[],occupied:Array<boolean>(periodCount).fill(false)}]));
 for(const {course,date} of occurrences){
  const column=columns.get(date);if(!column)continue;
  column.courses.push(course);
  for(let section=Math.max(1,course.start);section<=Math.min(periodCount,course.end);section++)column.occupied[section-1]=true;
 }
 return dayKeys.map(date=>{const column=columns.get(date)!;return {date,occupied:column.occupied,positioned:layoutCourses(column.courses)};});
}
