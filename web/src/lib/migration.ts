import type {Schedule,Course,Settings} from './model';
/** Additive schema-1 migration: retain course IDs, books and every existing preference. */
export function migrateSchedule(schedule:Schedule):Schedule{
 return {...schedule,courses:schedule.courses.map(course=>{
  const old=course as Course&{section?:number;startSection?:number;endSection?:number;dayOfWeek?:number};
  const start=old.start??old.startSection??old.section??1;
  return {...old,start,end:old.end??old.endSection??old.section??start,day:old.day??old.dayOfWeek??1};
 })};
}
export function migrateDisplay(settings:Settings):Settings{return {...settings,timetableMode:(settings.timetableMode??(settings as Settings&{viewMode?:string}).viewMode)==='grid'?'grid':'list',showTimes:settings.showTimes!==false,showCurrentTimeLine:settings.showCurrentTimeLine!==false};}
