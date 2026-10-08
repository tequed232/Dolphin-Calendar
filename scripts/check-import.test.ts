import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData,compactWeeks,coursesOn,parseDate,weekOf} from '../web/src/lib/model.ts';
import {parseImport,normalizeSchedule,normalizeRoom,navigationPlace,parseDay,parseNumbers} from '../web/src/lib/import.ts';
const current=initialData().schedule;
current.term={name:'测试学期',startDate:'2026-09-07',weeks:20};
const course={name:'高等数学',day:'周一',start:1,end:2,weeks:[1,3,5,7],room:'A101'};
test('扁平形状、围栏、schedule 包裹，缺日期时保留用户配置',()=>{
  const result=parseImport('```json\n'+JSON.stringify({schedule:{courses:[course]}})+'\n```','auto',current);
  assert.equal(result.courses[0].name,'高等数学');assert.equal(result.courses[0].day,1);assert.equal(result.term.startDate,current.term.startDate);assert.equal(result.courses[0].end,2);
});
test('应用二维形状读取真正节次标签，兼容老版 termStart',()=>{
  const result=normalizeSchedule({term:'旧学期',termStart:'2026-09-01',periods:[{period:'第3-4节',days:[[],[{name:'程序设计',weeks:'1-10双'}]]}]},current);
  assert.equal(result.courses[0].day,2);assert.equal(result.courses[0].start,1);assert.equal(result.courses[0].end,1);assert.equal(result.periods[0].label,'3-4');assert.equal(result.term.startDate,'2026-09-01');assert.deepEqual(result.courses[0].weeks,[2,4,6,8,10]);
});
test('顶层数组、老版 period、教师与星期别名',()=>{
  const r=normalizeSchedule([{course:'英语',weekDay:'礼拜三',period:'5-6',weekRange:'2;4-6',teacherName:'林老师'}],current);
  assert.equal(r.courses[0].teacher,'林老师');assert.equal(r.courses[0].day,3);assert.equal(r.courses[0].start,5);
});
test('星期别名与周次压缩',()=>{
  ['周一','星期一','礼拜一','Monday',1].forEach(d=>assert.equal(parseDay(d),1));assert.equal(parseDay('星期天'),7);
  assert.deepEqual(parseNumbers('第1-9周(单)',20,'周次'),[1,3,5,7,9]);assert.equal(compactWeeks([4,7,8,9,12,13,14,15,16,17,18,21]),'4;7-9;12-18;21');
});
test('不能静默吞掉任何坏课程、空课表或错误日期',()=>{
  for(const value of [{courses:[]},{courses:[course,{...course,name:''}]},{courses:[{...course,day:'周八'}]},{courses:[{...course,weeks:'1-1000'}]},{courses:[{...course,start:5,end:2}]},{term:{startDate:'2026-02-30'},courses:[course]}])assert.throws(()=>normalizeSchedule(value,current));
  assert.throws(()=>parseImport('{"courses": [}','json',current),/JSON 括号/);assert.throws(()=>parseImport('','auto',current),/没有可用内容/);
});
test('表格文本与真实日历周次',()=>{
  const r=parseImport('课程名 | 星期 | 节次 | 周次 | 教师 | 教室\n数学 | 周一 | 1-2 | 1-4 | 林 | A1','text',current);
  r.term.startDate='2026-09-07';assert.equal(coursesOn(r,parseDate('2026-09-07')).length,1);assert.equal(coursesOn(r,parseDate('2026-10-05')).length,0);assert.equal(weekOf(parseDate('2026-09-14'),'2026-09-07'),2);
});
test('第21周自动扩展，独立中午节次与明确开学日期保留',()=>{
 const r=normalizeSchedule({term:'2026-2027-1',termStart:'2026-08-31',periods:[{period:'第1-2节',time:'08:30-09:55',days:[[{name:'数学',weeks:'1-21'}]]},{period:'第中午1-中午2节',time:'12:10-13:35',days:[[],[{name:'午间实践',weeks:'21'}]]}]},current);
 assert.equal(r.term.weeks,21);assert.equal(r.term.startDate,'2026-08-31');assert.equal(r.courses.length,2);assert.equal(r.courses[1].start,2);assert.equal(r.periods[1].start,'12:10');assert.equal(r.periods[1].end,'13:35');assert.equal(r.periods[1].label,'中午1-中午2');assert.match(r.importNotes.join(' '),/推断这份课表为 21 周/);
 const exported=normalizeSchedule(JSON.parse(JSON.stringify(r)),current);assert.deepEqual(exported.periods,r.periods);assert.equal(exported.courses[1].start,2);
});
test('单周、双周、空周次按最终学期长度展开并明确告知',()=>{
 const r=normalizeSchedule({term:'2027-2028-1',lessons:[{...course,weeks:'1-22'},{...course,weeks:'单周'},{...course,weeks:''}]},current);
 assert.equal(r.term.startDate,current.term.startDate);assert.equal(r.term.weeks,22);assert.equal(r.courses[1].weeks.at(-1),21);assert.equal(r.courses[2].weeks.length,22);assert.match(r.importNotes.join(' '),/未填写周次/);
});
test('整学年连续 56 周和 120 周可导入，大量课次被明确拦截',()=>{
 const long=normalizeSchedule({term:'2026-2027-1',courses:[{...course,weeks:'1-56'},{...course,day:2,weeks:'单周'}]},current);
 assert.equal(long.term.weeks,56);assert.equal(long.courses[0].weeks.length,56);assert.equal(long.courses[1].weeks.at(-1),55);
 const longer=normalizeSchedule({courses:[{...course,weeks:[100,120]}]},current);assert.equal(longer.term.weeks,120);
 const flood=Array.from({length:100},(_,i)=>({...course,name:`课程${i}`,weeks:'1-250'}));assert.throws(()=>normalizeSchedule({courses:flood},current),/设备保护上限/);
});
test('不连续节次必须拆成多门课、节次时间必须合法',()=>{
  assert.throws(()=>normalizeSchedule({courses:[{...course,sections:'1,3'}]},current),/必须连续/);
  assert.throws(()=>normalizeSchedule({times:[{start:'10:00',end:'09:00'}],courses:[course]},current),/起止时间无效/);
});
test('JSON 导入统一楼栋教室格式，保留多教室原文，不猜测截断地点',()=>{
  assert.equal(normalizeRoom('16-203/202').room,'16栋203号教室');
  assert.equal(normalizeRoom('博学楼 A203').room,'博学楼A203号教室');
  assert.equal(normalizeRoom('示范大学博学楼A203号教室').room,'博学楼A203号教室');
  assert.equal(normalizeRoom('26-2...').incomplete,true);
  assert.equal(navigationPlace('16栋203号教室'),'16栋');
  assert.equal(navigationPlace('博学楼A203号教室'),'博学楼');
  assert.equal(navigationPlace('26-2...'),'26栋');
  const input={courses:[{...course,room:'16-203/202'},{...course,name:'线性代数',room:'26-2...'}]};
  const json=parseImport(JSON.stringify(input),'json',current);
  assert.equal(json.courses[0].room,'16栋203号教室');
  assert.match(json.courses[0].notes,/原始教室：16-203\/202/);
  assert.equal(json.courses[1].room,'26-2...');
  assert.match(json.importNotes.join(' '),/不完整.*仅导航到楼栋/);
});
