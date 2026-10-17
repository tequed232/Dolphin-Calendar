import assert from 'node:assert/strict';
import test from 'node:test';
import {courseDates,initialData,type Course} from '../web/src/lib/model';
import {countCourseOccurrences} from '../web/src/lib/courseOccurrences';
const course=(patch:Partial<Course>={}):Course=>({id:'test',name:'课次测试',day:1,start:1,end:2,weeks:[1,3,53],teacher:'',room:'',color:'sage',notes:'',...patch});
test('系统日历课次计数与实际日期一致，指定日期不依赖周次数组',()=>{
 const schedule=initialData().schedule;schedule.term.startDate='2026-10-05';
 for(const courses of [[course()],[course({specificDate:'2026-10-16',weeks:[]})],[course({specificDate:'2026-10-16'})],[course({weeks:[]})],[course(),course({specificDate:'2026-10-16',weeks:[]})]])
  assert.equal(countCourseOccurrences(courses),courses.flatMap(item=>courseDates(item,schedule)).length);
});
test('课次计数保留课程、空周次和隐藏节次原值，不改学期或课表',()=>{
 const courses=[course({end:24}),course({weeks:[]}),course({specificDate:'2026-10-16',weeks:[]})],before=structuredClone(courses);
 assert.equal(countCourseOccurrences(courses),4);assert.deepEqual(courses,before);assert.equal(countCourseOccurrences([]),0);
});
