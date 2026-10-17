import type {Course} from './model';

/** A specific-date course occurs once, independently of its repeating weeks. */
export function countCourseOccurrences(courses:readonly Course[]){return courses.reduce((sum,course)=>sum+(course.specificDate?1:course.weeks.length),0);}
