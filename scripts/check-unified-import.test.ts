import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImport,JSON_PROMPT} from '../web/src/lib/import.ts';
import {csvRows,parseSheet,readScheduleFile,parseFileSource,parseJSONPreview,UNIFIED_CSV_TEMPLATE,UNIFIED_JSON_TEMPLATE,UNIFIED_IMPORT_NOTES,CSV_TEMPLATE,CSV_TIME_TEMPLATE,JSON_TIME_TEMPLATE} from '../web/src/lib/fileImport.ts';
import {DEFAULT_PERIODS,initialData,type Schedule} from '../web/src/lib/model.ts';
import {generatePeriods,periodRest} from '../web/src/lib/scheduleTime.ts';

function existingSchedule():Schedule {
 const base=initialData().schedule;
 return {...base,term:{name:'原有学期',startDate:'2025-09-08',weeks:18},periods:generatePeriods(8,'08:20',45,10),courses:[{id:'existing-course',name:'原有课程',day:1,start:1,end:1,weeks:[1,2,3],teacher:'',room:'',color:'sage',notes:'原有备注'}]};
}
function parseCSV(text=UNIFIED_CSV_TEMPLATE,current=existingSchedule()) {
 return parseSheet({name:'complete.csv',rows:csvRows(text),merges:[]},current);
}
function assertComplete(schedule:Schedule) {
 assert.equal(schedule.periods.length,12);
 assert.deepEqual(schedule.periods.map(({start,end})=>({start,end})),DEFAULT_PERIODS);
 assert.deepEqual(schedule.periods[3].breakAfter,{label:'午休',start:'11:40',end:'14:00'});
 assert.deepEqual(periodRest(schedule.periods,3),{label:'午休',start:'11:40',end:'14:00'});
 assert.equal(schedule.courses.length,3);
 const math=schedule.courses.find(c=>c.name==='高等数学')!;
 assert.ok(math);assert.deepEqual([math.day,math.start,math.end],[3,5,6]);
 assert.deepEqual(math.weeks,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
 assert.equal(math.room,'16栋203号教室');assert.equal(math.teacher,'陈老师');
 const english=schedule.courses.find(c=>c.name==='大学英语')!;
 assert.deepEqual([english.day,english.start,english.end],[5,3,4]);
 assert.deepEqual(english.weeks,[1,3,5,7,9,11,13,15]);
 const single=schedule.courses.find(c=>c.name==='大学体育')!;
 assert.deepEqual([single.day,single.start,single.end],[4,7,7]);
 assert.deepEqual(single.weeks,[2,4,6,8,10,12,14,16]);
 assert.equal(single.room,'示例体育馆');
}
function courseData(schedule:Schedule) {
 return schedule.courses.map(({id,...course})=>course);
}

test('统一 CSV 同时导入全部逐节时间、午休、单节与连堂，不修改原数据',()=>{
 const current=existingSchedule(),before=structuredClone(current),rows=csvRows(UNIFIED_CSV_TEMPLATE);
 assert.equal(rows.length,17);assert.ok(rows.every(row=>row.length===9));
 assert.equal(rows.filter(row=>!row[0]&&!row[1]).length,12);
 const result=parseCSV(UNIFIED_CSV_TEMPLATE,current);
 assertComplete(result.schedule);assert.equal(result.blocks,3);assert.deepEqual(result.days,[3,4,5]);assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.schedule.term,current.term);assert.deepEqual(current,before);
 assert.ok(!result.schedule.courses.some(c=>c.id==='existing-course'));
 assert.ok(!result.schedule.importNotes?.some(note=>/未填写周次|部分节次没有/.test(note)));
});

test('统一 JSON 严格解析恢复学期、全部时间和三门课程，不沿用原有8节配置',()=>{
 const current=existingSchedule(),before=structuredClone(current),schedule=parseImport(UNIFIED_JSON_TEMPLATE,'json',current);
 assertComplete(schedule);assert.deepEqual(schedule.term,{name:'示例学期(请替换)',startDate:'2026-09-01',weeks:20});
 assert.deepEqual(current,before);assert.ok(!schedule.importNotes?.some(note=>/未填写周次|部分节次没有/.test(note)));
 const preview=parseJSONPreview(UNIFIED_JSON_TEMPLATE,current);
 assert.deepEqual(preview.errors,[]);assert.equal(preview.blocks,3);assert.deepEqual(preview.days,[3,4,5]);assertComplete(preview.schedule);
});

test('统一 CSV 与 JSON 对同一学期产生相同逐节作息、休息和实际课程信息',()=>{
 const current=existingSchedule();current.term=JSON.parse(UNIFIED_JSON_TEMPLATE).term;
 const csv=parseCSV(UNIFIED_CSV_TEMPLATE,current).schedule,json=parseImport(UNIFIED_JSON_TEMPLATE,'json',current);
 assert.deepEqual(csv.term,json.term);assert.deepEqual(csv.periods,json.periods);assert.deepEqual(courseData(csv),courseData(json));
});

for(const format of ['csv','json'] as const)test(`统一 ${format.toUpperCase()} 文件自动识别、预览与确认保存保持完整配置及ID`,async()=>{
 const current=existingSchedule(),content=format==='csv'?'\uFEFF'+UNIFIED_CSV_TEMPLATE:UNIFIED_JSON_TEMPLATE;
 const source=await readScheduleFile(new File([content],`dolphin-calendar-complete.${format}`,{type:format==='csv'?'text/csv':'application/json'}));
 assert.equal(source.format,format);
 const preview=parseFileSource(source,current);assert.deepEqual(preview.errors,[]);assertComplete(preview.schedule);
 const committed=parseImport(JSON.stringify(preview.schedule),'json',current,{allowEmpty:true,preserveCourseIds:true});
 assertComplete(committed);assert.deepEqual(committed.term,preview.schedule.term);assert.deepEqual(committed.periods,preview.schedule.periods);assert.deepEqual(committed.courses,preview.schedule.courses);
});

test('完整 CSV 中课程重复时间边界冲突会阻止导入，不覆盖逐节作息',()=>{
 const conflicting=UNIFIED_CSV_TEMPLATE.replace('大学体育,周四,7,16:00,16:45','大学体育,周四,7,16:05,16:45');
 assert.throws(()=>parseCSV(conflicting),/冲突|不一致/);
 const missingBoundary=UNIFIED_CSV_TEMPLATE.replace(',,6,14:55,15:40',',,6,14:55,');
 assert.throws(()=>parseCSV(missingBoundary),/同时填写|不完整/);
});

test('完整 JSON 拒绝非法时间、节次重叠与不在相邻节间的午休',()=>{
 const invalidClock=JSON.parse(UNIFIED_JSON_TEMPLATE);invalidClock.periods[5].end='25:10';
 assert.throws(()=>parseImport(JSON.stringify(invalidClock),'json',existingSchedule()),/时间/);
 const overlap=JSON.parse(UNIFIED_JSON_TEMPLATE);overlap.periods[1].start='08:30';
 assert.throws(()=>parseImport(JSON.stringify(overlap),'json',existingSchedule()),/重叠|顺序|早于/);
 const invalidBreak=JSON.parse(UNIFIED_JSON_TEMPLATE);invalidBreak.periods[3].breakAfter.start='11:00';
 assert.throws(()=>parseImport(JSON.stringify(invalidBreak),'json',existingSchedule()),/休息|午休/);
});

test('旧课程和仅时间模板继续沿用原语义，不要求用户拆分完整文件',()=>{
 const current=existingSchedule(),before=structuredClone(current);
 const courses=parseCSV(CSV_TEMPLATE,current).schedule;
 assert.equal(courses.courses.length,2);assert.deepEqual(courses.periods,current.periods);assert.deepEqual(courses.term,current.term);
 const csvTimes=parseCSV(CSV_TIME_TEMPLATE,current).schedule,jsonTimes=parseImport(JSON_TIME_TEMPLATE,'json',current);
 for(const schedule of [csvTimes,jsonTimes]) {
  assert.deepEqual(schedule.courses,current.courses);assert.deepEqual(schedule.term,current.term);assert.equal(schedule.periods.length,12);
  assert.deepEqual(schedule.periods.map(({start,end})=>({start,end})),DEFAULT_PERIODS);
  assert.equal(schedule.periods[3].breakAfter?.label,'午休');
 }
 assert.deepEqual(current,before);
});

test('统一提示词与说明明确缺失询问、逐节边界和单节/连堂，避免示例补造',()=>{
 for(const field of ['term','periods','courses','breakAfter'])assert.ok(JSON_PROMPT.includes(field));
 assert.match(JSON_PROMPT,/先向我列出具体问题并等待回答/);
 assert.match(JSON_PROMPT,/禁止按总时长平均拆分/);assert.match(JSON_PROMPT,/单节课使用 start=end/);assert.match(JSON_PROMPT,/连续多节课使用 start<end/);
 assert.match(JSON_PROMPT,/若用户明确确认了单节时长、课间长度和连堂构成规则/);assert.match(JSON_PROMPT,/可以依这些已确认规则计算每节边界/);assert.match(JSON_PROMPT,/不能自行假定规则/);
 assert.match(JSON_PROMPT,/不能漏掉没有课程的节次/);assert.match(JSON_PROMPT,/不得套入我的课表/);
 assert.ok(UNIFIED_IMPORT_NOTES.some(note=>/课程名与星期均为空/.test(note)));
 assert.ok(UNIFIED_IMPORT_NOTES.some(note=>/CSV 不设置学期日期与总周数/.test(note)));
});
