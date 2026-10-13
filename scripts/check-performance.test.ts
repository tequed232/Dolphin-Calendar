import assert from 'node:assert/strict';
import test from 'node:test';
import {addDays,courseDates,dateKey,initialData,parseDate,type Course} from '../web/src/lib/model';
import {dateStripWindow} from '../web/src/components/dateStripWindow';
import {courseDateIndex,courseDateSuggestions} from '../web/src/components/homePresentation';
import {layoutCourses,weekGridPresentation} from '../web/src/components/timetablePresentation';

function previousDateWindow(start:Date,length:number,showWeekend:boolean){
 return Array.from({length},(_,index)=>{
  if(showWeekend)return addDays(start,index);
  let date=new Date(start),remaining=index;
  while(remaining){date=addDays(date,1);if(date.getDay()!==0&&date.getDay()!==6)remaining--;}
  return date;
 });
}
const keys=(dates:Date[])=>dates.map(dateKey);
const course=(id:string,day:number,start:number,end:number,weeks=[1,2]):Course=>({id,name:id,day,start,end,weeks,teacher:'',room:'',notes:'',color:'sage'});

test('线性181日窗口保持旧版日期、周末锚点、跨月/跨年/闰日语义',()=>{
 for(const start of ['2024-02-29','2026-12-31','2026-10-03','2026-10-05'])for(const weekend of [true,false]){
  const date=parseDate(start);assert.deepEqual(keys(dateStripWindow(date,181,weekend)),keys(previousDateWindow(date,181,weekend)));assert.equal(dateKey(date),start);
 }
});
test('181日工作日窗口只推进252个日历日，旧版重复推进22662次',()=>{
 const original=Date.prototype.setDate;let advances=0;
 Date.prototype.setDate=function(day:number){advances++;return original.call(this,day);};
 try{
  const date=parseDate('2026-10-05'),before=keys(previousDateWindow(date,181,false)),baseline=advances;advances=0;
  const after=keys(dateStripWindow(date,181,false)),improved=advances;assert.deepEqual(after,before);assert.equal(baseline,22662);assert.equal(improved,252);assert.ok(improved*80<baseline);
 }finally{Date.prototype.setDate=original;}
});
test('日期建议展示索引保留有课日期、临时课程、缺节过滤与严格下一日期',()=>{
 const schedule=initialData().schedule;schedule.term.startDate='2026-10-05';
 schedule.courses=[course('mon',1,1,2,[3,1,2]),course('mon-same',1,3,3,[1]),{...course('temporary',7,1,1),specificDate:'2026-12-31'},course('invalid',3,1,13)];
 const before=structuredClone(schedule),dates=courseDateIndex(schedule);
 assert.deepEqual(dates,['2026-10-05','2026-10-12','2026-10-19','2026-12-31']);
 for(const selected of ['2025-01-01','2026-10-05','2026-10-06','2026-10-19','2026-12-31','2027-01-01']){
  const oldDates=schedule.courses.filter(c=>c.start>=1&&c.end<=schedule.periods.length).flatMap(c=>courseDates(c,schedule));
  assert.deepEqual(courseDateSuggestions(dates,selected),{first:oldDates.sort()[0],next:oldDates.filter(date=>date>selected).sort()[0]});
 }
 assert.deepEqual(courseDateSuggestions([], '2026-10-05'),{first:undefined,next:undefined});assert.deepEqual(schedule,before);
});
test('缓存索引多次日期查询不重新枚举课程出现日期',()=>{
 const schedule=initialData().schedule;schedule.term.startDate='2026-10-05';schedule.courses=Array.from({length:700},(_,i)=>course('large-'+i,i%7+1,i%12+1,i%12+1,Array.from({length:40},(_,w)=>w+1)));
 const original=Date.prototype.setDate;let advances=0;Date.prototype.setDate=function(day:number){advances++;return original.call(this,day);};
 try{const dates=courseDateIndex(schedule);assert.ok(advances>=28000);advances=0;for(let i=0;i<1000;i++)courseDateSuggestions(dates,`2026-10-${String(i%31+1).padStart(2,'0')}`);assert.equal(advances,0);}finally{Date.prototype.setDate=original;}
});
test('周列计划保留冲突lane、空节、跨节、临时日期，不修改原课程',()=>{
 const days=Array.from({length:7},(_,i)=>dateKey(addDays(parseDate('2026-10-05'),i)));
 const courses=[course('linked',1,1,3),course('conflict',1,2,4),course('single',2,8,8),{...course('temporary',7,11,12),specificDate:days[6]}];
 const occurrences=courses.map(c=>({course:c,date:days[c.day-1]})),before=structuredClone(occurrences),plan=weekGridPresentation(occurrences,days,12);
 for(const column of plan){const list=occurrences.filter(item=>item.date===column.date).map(item=>item.course);assert.deepEqual(column.positioned,layoutCourses(list));assert.deepEqual(column.occupied,Array.from({length:12},(_,i)=>list.some(c=>c.start<=i+1&&c.end>=i+1)));}
 assert.deepEqual(plan[0].positioned.map(({lane,lanes})=>({lane,lanes})),[{lane:0,lanes:2},{lane:1,lanes:2}]);assert.deepEqual(occurrences,before);
});
