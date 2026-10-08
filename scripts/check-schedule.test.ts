import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import {initialData,coursesOn,parseDate,courseDates,type Course} from '../web/src/lib/model.ts';
import {normalizeSchedule,parseImport} from '../web/src/lib/import.ts';
import {gridRows,weekOccurrences,closestSection} from '../web/src/lib/gridLayout.ts';
import {csvRows,parseSheet,readScheduleFile,parseFileSource,decodeText,parseJSONPreview,CSV_TEMPLATE,CSV_TIME_TEMPLATE} from '../web/src/lib/fileImport.ts';
import {resizePeriods,generatePeriods,retimePeriods,coursesConflict,periodRest,currentTimePosition} from '../web/src/lib/scheduleTime.ts';
import {migrateSchedule,migrateDisplay} from '../web/src/lib/migration.ts';
import {newerVersion,releaseFromAPI} from '../web/src/lib/releases.ts';
const current=initialData().schedule;current.term={name:'秋季',startDate:'2026-09-01',weeks:20};
const course={name:'数学',day:1,start:1,end:2,weeks:[1,2]};
test('导入 8→12 节同步日期、节数与时间；缺失配置保留原值',()=>{
 const before={...current,periods:current.periods.slice(0,8)};
 const times=generatePeriods(12,'08:20',45,10);
 const r=normalizeSchedule({semester:{startDate:'2026-09-07'},schedule:{courseCount:12,times,courses:[course]}},before);
 assert.equal(r.term.startDate,'2026-09-07');assert.equal(r.periods.length,12);assert.equal(r.periods[0].start,'08:20');assert.deepEqual(r.periods,times);
 const retained=normalizeSchedule({courses:[course]},before);assert.deepEqual(retained.term,before.term);assert.deepEqual(retained.periods,before.periods);
});
test('生成节次、自动顺延和时间验证，包括14节与午夜边界',()=>{
 const extended=resizePeriods(current.periods,14);assert.equal(extended.length,14);assert.deepEqual(extended.slice(0,12),current.periods);assert.ok(extended[13].end<'24:00');
 assert.equal(generatePeriods(14,'08:20',45,10)[1].start,'09:15');
 assert.throws(()=>generatePeriods(14,'23:00'),/午夜/);assert.throws(()=>resizePeriods(current.periods,25),/1–24/);
 assert.throws(()=>normalizeSchedule({courseCount:12,times:current.periods.slice(0,8),courses:[course]},current),/数量不一致/);
});
test('合并单元格只生成一个1–2节数学；星期中英与中文节次',()=>{
 const sheet={name:'课表',rows:[['节次','星期一','Tue'],['第一节','数学','英语'],['第二节','','']],merges:[{s:{r:1,c:1},e:{r:2,c:1}}]};
 const r=parseSheet(sheet,current);assert.equal(r.blocks,2);assert.equal(r.schedule.courses.filter(c=>c.name==='数学').length,1);assert.equal(r.schedule.courses[0].end,2);assert.equal(r.schedule.courses[1].day,2);
});
test('CSV 引号、逗号、换行、重复引号与扁平格式',()=>{
 const rows=csvRows('课程名,星期,节次,周次,教师,备注\r\n"数学,基础",Mon,1-2,1-4,"王""老师","带书\n作业"');
 assert.equal(rows[1][0],'数学,基础');assert.equal(rows[1][4],'王"老师');
 const r=parseSheet({name:'CSV',rows,merges:[]},current);assert.equal(r.schedule.courses[0].end,2);assert.match(r.schedule.courses[0].notes,/带书\n作业/);
 assert.throws(()=>csvRows('课程名,星期\n"未闭合,Mon'),/未闭合/);
});
test('表格坏行明确报告并保留有效课程；空表/映射无效给出错误',()=>{
 const r=parseSheet({name:'list',rows:[['课程名','星期','节次'],['数学','Mon','1'],['坏数据','周八','2']],merges:[]},current);assert.equal(r.blocks,1);assert.equal(r.errors.length,1);assert.match(r.errors[0],/周八/);
 assert.throws(()=>parseSheet({name:'empty',rows:[[]],merges:[]},current),/空/);
 assert.throws(()=>parseSheet({name:'unknown',rows:[['标题'],['内容']],merges:[]},current),/手动/);
});
test('手工映射定位课表区域',()=>{
 const rows=[['提示'],['提示'],['','', '周一','周二'],['','1','数学','英语']];
 const r=parseSheet({name:'mapped',rows,merges:[]},current,{dayRow:2,sectionColumn:1,firstRow:3,lastRow:3,firstColumn:2,lastColumn:3});assert.equal(r.blocks,2);
});
for(const type of ['xlsx','xls'] as const)test(`真实 ${type} 二进制、多工作表和合并单元格`,async()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['节次','周一','周二'],[1,'数学','英语'],[2,'','']]);sheet['!merges']=[{s:{r:1,c:1},e:{r:2,c:1}}];XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['提示']]),'说明');XLSX.utils.book_append_sheet(book,sheet,'课表');
 const file=new File([XLSX.write(book,{type:'array',bookType:type})],`test.${type}`);const source=await readScheduleFile(file);assert.equal(source.sheets.length,2);const result=parseFileSource(source,current,1);assert.equal(result.schedule.courses[0].end,2);assert.equal(result.blocks,2);
});
test('损坏 Excel、未知类型与文件上限不会被误读为课程',async()=>{
 await assert.rejects(readScheduleFile(new File(['broken'],'bad.xlsx')),/无法解析该 Excel 文件/);await assert.rejects(readScheduleFile(new File(['unknown'],'unknown.doc')),/支持/);await assert.rejects(readScheduleFile(new File([new Uint8Array(5_000_001)],'big.json')),/5 MB/);
 assert.equal(decodeText(new Uint8Array([255,254,0x2d,0x4e])),'中');
});
test('临时课程只在指定日期显示、导出再导入保持属性',()=>{
 const r=normalizeSchedule({courses:[{...course,temporary:true,specificDate:'2026-10-07',start:5,end:7}]},current);
 assert.equal(coursesOn(r,parseDate('2026-10-07')).length,1);assert.equal(coursesOn(r,parseDate('2026-10-14')).length,0);assert.deepEqual(courseDates(r.courses[0],r),['2026-10-07']);assert.equal(normalizeSchedule(r,current).courses[0].temporary,true);
});
test('冲突检测区分日期/周次和节次，缩短节数保留原课程',()=>{
 const a={...course,id:'a',teacher:'',room:'',notes:'',color:'sage'} as Course,b={...a,id:'b',start:2,end:4};assert.ok(coursesConflict(a,b));assert.ok(!coursesConflict(a,{...b,weeks:[3]}));assert.ok(!coursesConflict({...a,specificDate:'2026-09-07'},{...b,specificDate:'2026-09-14'}));
 const r={...current,courses:[{...a,start:11,end:12}],periods:current.periods.slice(0,10)};assert.equal(coursesOn(r,parseDate('2026-09-07')).length,0);assert.equal(r.courses.length,1);
});
test('旧 section 字段迁移、已有ID与配置不丢失',()=>{
 const old={...current,courses:[{...course,id:'stable',section:3,start:undefined,end:undefined}]} as unknown as typeof current;
 const migrated=migrateSchedule(old);assert.equal(migrated.courses[0].start,3);assert.equal(migrated.courses[0].end,3);assert.equal(migrated.courses[0].id,'stable');assert.equal(migrateDisplay(initialData().settings).timetableMode,'list');
});
test('仅正式高版本提供更新提示，预发布/降级/API非法地址拒绝',()=>{
 assert.ok(newerVersion('v1.4.4','1.4.3'));assert.ok(!newerVersion('1.4.3','1.4.3'));assert.ok(!newerVersion('1.4.4-beta','1.4.3'));
 const raw={tag_name:'v1.4.4',name:'新版',published_at:'2026-10-07T00:00:00Z',html_url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v1.4.4',body:'说明'};assert.equal(releaseFromAPI(raw).title,'新版');assert.throws(()=>releaseFromAPI({...raw,prerelease:true}));assert.throws(()=>releaseFromAPI({...raw,html_url:'https://example.com'}));
});
test('JSON 预览报告坏课程，不静默吞掉；无有效课程仍拒绝',async()=>{
 const {parseJSONPreview}=await import('../web/src/lib/fileImport.ts');
 const result=parseJSONPreview(JSON.stringify({courses:[course,{...course,name:'坏课程',day:8}]}),current);assert.equal(result.blocks,1);assert.equal(result.errors.length,1);assert.match(result.schedule.importNotes!.join(' '),/跳过 1/);
 assert.throws(()=>parseJSONPreview(JSON.stringify({courses:[{...course,day:8}]}),current));
});
test('修改开学日期后临时课程冲突仍依据实际日期',()=>{
 const a={...course,id:'temp',teacher:'',room:'',notes:'',color:'sage',specificDate:'2026-10-05'} as Course;
 assert.ok(coursesConflict(a,{...a,id:'normal',specificDate:undefined,weeks:[5]},'2026-09-07'));
 assert.ok(!coursesConflict(a,{...a,id:'normal',specificDate:undefined,weeks:[1]},'2026-09-07'));
});
test('显式时间索引排序并拒绝重复/缺失索引',()=>{
 const times=[{index:2,start:'08:55',end:'09:40'},{index:1,start:'08:00',end:'08:45'}];
 assert.equal(normalizeSchedule({times,courses:[course]},current).periods[0].start,'08:00');
 assert.throws(()=>normalizeSchedule({times:[times[0],times[0]],courses:[course]},current),/index/);
});
test('包裹 JSON 的部分坏记录仍预览合法课程并报告原始行号',()=>{
 for(const wrapper of ['schedule','data','result']){
  const result=parseJSONPreview(JSON.stringify({semester:{startDate:'2026-09-07'},[wrapper]:{courses:[course,{...course,name:'坏课程',day:8}]}}),current);
  assert.equal(result.blocks,1);assert.equal(result.schedule.courses[0].name,'数学');assert.equal(result.schedule.term.startDate,'2026-09-07');assert.equal(result.errors.length,1);assert.match(result.errors[0],/第 2 条.*8/);
 }
 const array=parseJSONPreview(JSON.stringify({data:[course,{...course,day:8}]}),current);assert.equal(array.blocks,1);assert.equal(array.errors.length,1);
});
test('表格坏节次不能阻止合法行预览或改变节数',()=>{
 const before={...current,periods:current.periods.slice(0,8)};
 const result=parseSheet({name:'CSV',rows:[['课程名','星期','开始节次','结束节次'],['数学','周一','1','2'],['越界','周二','1','25'],['倒序','周三','6','3'],['非法','周四','1','NaN'],['坏星期','周八','1','24'],['','周一','1','24']],merges:[]},before);
 assert.equal(result.blocks,1);assert.equal(result.schedule.periods.length,8);assert.equal(result.errors.length,5);assert.match(result.errors[0],/第 3 行.*1–24/);
 const extended=parseSheet({name:'CSV',rows:[['课程名','星期','开始节次','结束节次'],['晚课','周一','13','14'],['越界','周二','1','25']],merges:[]},before);
 assert.equal(extended.blocks,1);assert.equal(extended.schedule.periods.length,14);assert.equal(extended.schedule.courses[0].end,14);assert.equal(extended.errors.length,1);
});
test('只导入一项时间参数时保留其余已有课时与课间',()=>{
 const before={...current,periods:generatePeriods(3,'08:00',60,15)};
 assert.deepEqual(normalizeSchedule({firstStart:'08:20',courses:[course]},before).periods,generatePeriods(3,'08:20',60,15));
 assert.deepEqual(normalizeSchedule({duration:50,courses:[course]},before).periods,generatePeriods(3,'08:00',50,15));
 assert.deepEqual(normalizeSchedule({breakMinutes:5,courses:[course]},before).periods,generatePeriods(3,'08:00',60,5));
 const irregular={...before,periods:[{label:'上午',start:'08:00',end:'08:40'},{label:'下午',start:'13:00',end:'14:00'},{start:'14:20',end:'15:10'}]};
 assert.deepEqual(normalizeSchedule({firstStart:'08:20',courses:[course]},irregular).periods,[{label:'上午',start:'08:20',end:'09:00'},{label:'下午',start:'13:20',end:'14:20'},{start:'14:40',end:'15:30'}]);
 assert.throws(()=>normalizeSchedule({firstStart:'23:00',courses:[course]},before),/午夜/);
});
test('配置仅导入保留课程、ID与全部字段，缩减后再次校验也不丢失',()=>{
 const saved={...course,id:'stable',teacher:'教师',room:'16-203/202',notes:'原有备注',color:'rose',temporary:true,specificDate:'2026-10-07',start:11,end:12,weeks:[6]} as Course;
 const before={...current,courses:[saved]};
 const preview=parseJSONPreview(JSON.stringify({semester:{startDate:'2026-09-07',weeks:5},schedule:{courseCount:8}}),before).schedule;
 assert.equal(preview.periods.length,8);assert.equal(preview.term.startDate,'2026-09-07');assert.equal(preview.term.weeks,5);assert.deepEqual(preview.courses,before.courses);
 const committed=parseImport(JSON.stringify(preview),'json',before,{allowEmpty:true,preserveCourseIds:true});
 assert.equal(committed.periods.length,8);assert.equal(committed.term.weeks,5);assert.deepEqual(committed.courses,before.courses);
 assert.throws(()=>normalizeSchedule({term:preview.term,courseCount:8,courses:[{...saved,name:'新课程'}]},before,{preserveCourseIds:true}),/1–8/);
});
test('空课表可导入配置；显式空课程列表仍被拒绝',()=>{
 const empty={...current,courses:[]};
 const result=parseJSONPreview(JSON.stringify({schedule:{courseCount:10,firstStart:'08:20'}}),empty);
 assert.equal(result.blocks,0);assert.equal(result.schedule.periods.length,10);assert.equal(result.schedule.periods[0].start,'08:20');
 const committed=parseImport(JSON.stringify(result.schedule),'json',empty,{allowEmpty:true,preserveCourseIds:true});assert.deepEqual(committed.courses,[]);assert.equal(committed.periods.length,10);
 for(const raw of [{},{courses:[]},{semester:{startDate:'2026-09-07'},courses:[]}])assert.throws(()=>parseJSONPreview(JSON.stringify(raw),empty));
});
test('旧午间无时间分组可预览、确认并从完整备份恢复',()=>{
 const raw={term:{startDate:'2026-10-05'},periods:[{period:'1-2',days:[{name:'数学'},null,null,null,null,null,null]},{period:'中午1',days:[null,{name:'午间讲座'},null,null,null,null,null]}]};
 const preview=parseJSONPreview(JSON.stringify(raw),current).schedule;
 const committed=parseImport(JSON.stringify(preview),'json',current,{allowEmpty:true,preserveCourseIds:true});
 assert.deepEqual(committed.periods,preview.periods);assert.deepEqual(committed.courses,preview.courses);
 const restored=parseJSONPreview(JSON.stringify(committed),initialData().schedule).schedule;
 assert.deepEqual(restored.periods,committed.periods);assert.deepEqual(restored.courses,committed.courses);
 assert.match(restored.importNotes!.join(' '),/暂不发送定时提醒/);
});
test('真实完整空课表备份恢复配置；普通空数组不能清除现有课程',()=>{
 const exported={term:{name:'空白新学期',startDate:'2026-10-05',weeks:12},periods:generatePeriods(4,'08:20',45,10),courses:[]};
 const before={...current,courses:[{...course,id:'existing',teacher:'',room:'',notes:'',color:'rose'} as Course]};
 const preview=parseJSONPreview(JSON.stringify(exported),before).schedule;
 const committed=parseImport(JSON.stringify(preview),'json',before,{allowEmpty:true,preserveCourseIds:true});
 assert.deepEqual(committed.term,exported.term);assert.deepEqual(committed.periods,exported.periods);assert.deepEqual(committed.courses,[]);
 for(const raw of [{courses:[]},{term:{startDate:'2026-10-05'},courses:[]},{periods:exported.periods,courses:[]}])assert.throws(()=>parseJSONPreview(JSON.stringify(raw),before),/没有可导入/);
});
test('完整备份保留缩短配置后隐藏的课程、原ID和字段，仍拒绝超24节或重复ID',()=>{
 const saved={...course,id:'hidden-stable',teacher:'教师',room:'16-203/202',notes:'原有备注',color:'rose',temporary:true,specificDate:'2026-10-07',day:3,start:11,end:12,weeks:[6]} as Course;
 const exported={...current,term:{...current.term,weeks:5},periods:current.periods.slice(0,8),courses:[saved]};
 const preview=parseJSONPreview(JSON.stringify(exported),initialData().schedule).schedule;
 assert.deepEqual(preview.courses,exported.courses);assert.deepEqual(preview.term,exported.term);assert.deepEqual(preview.periods,exported.periods);
 assert.match(preview.importNotes!.join(' '),/课程仍保留/);
 const committed=parseImport(JSON.stringify(preview),'json',initialData().schedule,{allowEmpty:true,preserveCourseIds:true});assert.deepEqual(committed.courses,exported.courses);
 assert.throws(()=>parseJSONPreview(JSON.stringify({...exported,courses:[{...saved,end:25}]}),current),/1–24/);
 assert.throws(()=>parseJSONPreview(JSON.stringify({...exported,courses:[saved,{...saved,name:'重复ID'}]}),current),/ID 重复/);
});
test('无时间分组不绕过严格时间校验，空分组前后有效时段不能重叠',()=>{
 const exported={...current,periods:[{label:'上午',start:'08:00',end:'08:45'},{label:'午间',start:'',end:''},{label:'下午',start:'13:00',end:'13:45'}],courses:[]};
 assert.equal(parseJSONPreview(JSON.stringify(exported),current).schedule.periods.length,3);
 assert.throws(()=>parseJSONPreview(JSON.stringify({...exported,periods:[exported.periods[0],{label:'午间',start:'',end:'12:00'}]}),current),/起止时间无效/);
 assert.throws(()=>parseJSONPreview(JSON.stringify({...exported,periods:[...exported.periods.slice(0,2),{start:'08:30',end:'09:15'}]}),current),/不能重叠/);
 assert.throws(()=>normalizeSchedule({times:[{label:'未知',start:'',end:''}],courses:[{...course,start:1,end:1}]},current),/起止时间无效/);
});
test('先应用新时间再增加节数，旧末节接近午夜不阻断合法配置',()=>{
 const late={...current,periods:[{label:'晚课',start:'23:00',end:'23:59'}]};
 const complete=normalizeSchedule({courseCount:2,firstStart:'08:00',duration:45,breakMinutes:10,courses:[course]},late);
 assert.deepEqual(complete.periods,[{label:'晚课',start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'}]);
 const partial=normalizeSchedule({courseCount:2,firstStart:'08:00',breakMinutes:15,courses:[course]},late);
 assert.deepEqual(partial.periods,[{label:'晚课',start:'08:00',end:'08:59'},{start:'09:14',end:'10:13'}]);
 const shortened=normalizeSchedule({courseCount:2,duration:90,courses:[course]},current);
 assert.deepEqual(shortened.periods,[{start:'08:00',end:'09:30'},{start:'09:40',end:'11:10'}]);
 assert.throws(()=>normalizeSchedule({courseCount:24,firstStart:'23:00',duration:45,breakMinutes:10,courses:[course]},late),/午夜/);
});
test('部分错误预览仍按完整合法课表的最终周数展开单双周和缺省周次',()=>{
 const result=parseJSONPreview(JSON.stringify({schedule:{courses:[{...course,weeks:'单周'},{...course,name:'学期末',weeks:[21]},{...course,day:8}]}}),current);
 assert.equal(result.schedule.term.weeks,21);assert.equal(result.schedule.courses[0].weeks.at(-1),21);assert.equal(result.errors.length,1);
 const sheet=parseSheet({name:'CSV',rows:[['课程名','星期','节次','周次'],['每周课','周一','1',''],['单周课','周二','2','单周'],['学期末','周三','3','21'],['坏课程','周八','4','1']],merges:[]},current);
 assert.equal(sheet.schedule.term.weeks,21);assert.equal(sheet.schedule.courses[0].weeks.at(-1),21);assert.equal(sheet.schedule.courses[1].weeks.at(-1),21);assert.equal(sheet.errors.length,1);
});

test('文件内容可识别未知扩展名，格式错配需确认并支持显式重试',async()=>{
 const json='{"courses":[{"name":"数学","day":3,"start":5,"end":6,"weeks":[1]}]}';
 assert.equal((await readScheduleFile(new File([json],'schedule.backup'))).format,'json');
 await assert.rejects(readScheduleFile(new File([json],'schedule.csv')),/扩展名.*内容不一致/);
 assert.equal((await readScheduleFile(new File([json],'schedule.csv'),'json')).format,'json');
 await assert.rejects(readScheduleFile(new File([],'empty.csv')),/文件为空/);
});
test('同周七天具有相同整周课程，跨周变化只取决于上课周次',()=>{
 const schedule={...current,term:{...current.term,startDate:'2026-10-05'},courses:[{...current.courses[0],id:'week-test',name:'数学',day:3,start:5,end:6,weeks:[1]}]};
 for(const date of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11'])assert.deepEqual(weekOccurrences(schedule,date).map(item=>[item.course.id,item.date]),[['week-test','2026-10-07']]);
 assert.equal(weekOccurrences(schedule,'2026-10-12').length,0);
});
test('网格采用真实课时和休息间隔，非等距边界吸附与缩放一致',()=>{
 const rows=gridRows([{start:'08:00',end:'08:45'},{start:'08:55',end:'10:25'},{start:'13:30',end:'14:15'}]);
 assert.ok(rows[1].lesson>rows[0].lesson);assert.ok(rows[1].breakHeight>rows[0].breakHeight);assert.equal(rows[2].breakHeight,0);
 const points=[0,rows[0].height+3,rows[0].height+rows[1].height+6];
 assert.equal(closestSection(points,1,points[2]),3);assert.equal(closestSection(points.map(x=>x*.85),1,points[2]*.85),3);assert.equal(closestSection(points,2,-10000),1);assert.equal(closestSection(points,2,10000),3);
});

test('JSON时间别名和一位小时规范化后用于内置节次，不接受非法时间',()=>{
 for(const key of ['times','periodTimes','periods'])for(const [start,end] of [['startTime','endTime'],['上课时间','下课时间'],['开始时间','结束时间']]){
  const result=parseJSONPreview(JSON.stringify({[key]:[{[start]:'8:05',[end]:'8:50'},{[start]:'9:00',[end]:'9:45'}],courses:[course]}),current);
  assert.deepEqual(result.schedule.periods,[{start:'08:05',end:'08:50'},{start:'09:00',end:'09:45'}]);
  const committed=parseImport(JSON.stringify(result.schedule),'json',current,{allowEmpty:true,preserveCourseIds:true});assert.deepEqual(committed.periods,result.schedule.periods);
 }
 assert.throws(()=>parseJSONPreview(JSON.stringify({times:[{startTime:'24:00',endTime:'24:45'}],courses:[course]}),current),/第 1 节.*HH:mm/);
 assert.equal(normalizeSchedule({firstStart:'8:05'},current).periods[0].start,'08:05');
});

test('真实CSV时间表完整恢复12节、保留原课程ID并可确认导入',async()=>{
 const before={...current,periods:current.periods.slice(0,8),courses:[{...current.courses[0],...course,id:'kept-time-course',teacher:'原教师',room:'16-203',notes:'原备注',color:'rose',start:11,end:12}] as Course[]};
 const source=await readScheduleFile(new File([CSV_TIME_TEMPLATE],'period-times.csv'));
 const result=parseFileSource(source,before);assert.equal(result.blocks,0);assert.equal(result.schedule.periods.length,12);assert.deepEqual(result.schedule.periods.map(({start,end})=>({start,end})),current.periods);assert.deepEqual(result.schedule.periods[3].breakAfter,{label:'午休',start:'11:40',end:'14:00'});assert.deepEqual(result.schedule.courses,before.courses);assert.deepEqual(result.schedule.term,before.term);
 assert.match(result.schedule.importNotes!.join(' '),/文件仅更新课表配置/);
 const committed=parseImport(JSON.stringify(result.schedule),'json',before,{allowEmpty:true,preserveCourseIds:true});assert.deepEqual(committed.courses,before.courses);assert.deepEqual(committed.periods,result.schedule.periods);
});

test('CSV连堂时间只应用外侧边界，不推算中间课时，课程示例也可实际解析',()=>{
 const result=parseSheet({name:'CSV',rows:csvRows('课程名,星期,节次,上课时间,下课时间\n数学,周三,5-6,14:05,15:45'),merges:[]},current);
 assert.equal(result.schedule.periods[4].start,'14:05');assert.equal(result.schedule.periods[5].end,'15:45');assert.equal(result.schedule.periods[4].end,current.periods[4].end);assert.equal(result.schedule.periods[5].start,current.periods[5].start);
 assert.deepEqual(result.schedule.periods.slice(0,4),current.periods.slice(0,4));assert.deepEqual(result.schedule.periods.slice(6),current.periods.slice(6));assert.equal(result.schedule.courses[0].start,5);assert.equal(result.schedule.courses[0].end,6);assert.match(result.schedule.importNotes!.join(' '),/中间节次.*未作推算/);
 const example=parseSheet({name:'示例',rows:csvRows(CSV_TEMPLATE),merges:[]},current);assert.equal(example.blocks,2);assert.deepEqual(example.schedule.periods,current.periods);
 const custom={...current,periods:generatePeriods(12,'08:20',45,10)};const customExample=parseSheet({name:'自定义课时示例',rows:csvRows(CSV_TEMPLATE),merges:[]},custom);assert.equal(customExample.blocks,2);assert.deepEqual(customExample.errors,[]);assert.deepEqual(customExample.schedule.periods,custom.periods);
});

test('CSV部分节次时间更新保留未提供的配置及原课程，单节课程英文时间列可读取',()=>{
 const before={...current,courses:[{...course,id:'partial-kept',teacher:'',room:'',notes:'',color:'sage'} as Course]};
 const result=parseSheet({name:'partial',rows:csvRows('节次,上课时间,下课时间\n3,10:05,10:50\n5,14:05,14:50'),merges:[]},before);
 assert.equal(result.schedule.periods.length,12);assert.deepEqual(result.schedule.courses,before.courses);assert.deepEqual(result.schedule.term,before.term);
 result.schedule.periods.forEach((period,i)=>assert.deepEqual(period,i===2?{start:'10:05',end:'10:50'}:i===4?{start:'14:05',end:'14:50'}:before.periods[i]));
 const single=parseSheet({name:'English',rows:csvRows('name,day,startSection,endSection,startTime,endTime\nMath,Mon,1,1,8:05,8:50'),merges:[]},before);
 assert.deepEqual(single.schedule.periods[0],{start:'08:05',end:'08:50'});assert.equal(single.schedule.periods.length,12);assert.equal(single.schedule.courses.length,1);
});

test('CSV混合课程和完整时间行统一更新课程与每日节数，不清空配置-only课程',()=>{
 const rows=[['课程名','星期','节次','上课时间','下课时间'],['数学','周三','1-2','08:00','09:40'],...current.periods.slice(0,6).map((period,i)=>['','',String(i+1),period.start,period.end])];
 const result=parseSheet({name:'mixed',rows,merges:[]},current);assert.equal(result.blocks,1);assert.equal(result.schedule.periods.length,6);assert.deepEqual(result.schedule.periods,current.periods.slice(0,6));assert.equal(result.schedule.courses[0].name,'数学');
 const late={...current,periods:[{start:'23:00',end:'23:59'}]};
 const restored=parseSheet({name:'new-times',rows:csvRows('节次,上课时间,下课时间\n1,08:00,08:45\n2,08:55,09:40'),merges:[]},late);assert.deepEqual(restored.schedule.periods,current.periods.slice(0,2));
});

test('CSV重复边界一致允许，冲突指出双方行号并阻止导入',()=>{
 const prefix='课程名,星期,节次,上课时间,下课时间\n数学,周一,1-2,08:00,09:40\n';
 const same=parseSheet({name:'same',rows:csvRows(prefix+'英语,周二,1-2,08:00,09:40'),merges:[]},current);assert.equal(same.blocks,2);assert.deepEqual(same.schedule.periods,current.periods);
 assert.throws(()=>parseSheet({name:'conflict',rows:csvRows(prefix+'英语,周二,1-2,08:10,09:40'),merges:[]},current),/第 3 行与第 2 行冲突.*第 1 节/);
 assert.throws(()=>parseSheet({name:'duplicate-column',rows:csvRows('节次,上课时间,startTime,下课时间\n1,08:00,08:05,08:45'),merges:[]},current),/第 1 行.*列重复/);
});

test('CSV时间缺半对、非法时间、倒序、应用后重叠和多节时间行均明确拒绝',()=>{
 for(const [line,expected] of [['1,08:00,',/第 2 行.*同时填写/],['1,24:00,24:45',/第 2 行.*HH:mm/],['1,8:5,08:45',/第 2 行.*HH:mm/],['1,08:45,08:00',/第 2 行.*晚于/],['1-2,08:00,09:40',/第 2 行.*一个节次/]] as const){
  assert.throws(()=>parseSheet({name:'bad-time',rows:csvRows('节次,上课时间,下课时间\n'+line),merges:[]},current),expected);
 }
 assert.throws(()=>parseSheet({name:'overlap',rows:csvRows('课程名,星期,节次,上课时间,下课时间\n数学,Mon,1-2,08:00,10:10'),merges:[]},current),/第 2 行.*第 2–3 节.*重叠/);
 assert.throws(()=>parseSheet({name:'missing-column',rows:csvRows('节次,上课时间\n1,08:00'),merges:[]},current),/第 2 行.*同时填写/);
 assert.throws(()=>parseSheet({name:'bad-course-time',rows:csvRows('课程名,星期,节次,上课时间,下课时间\n数学,周八,1,24:00,24:45'),merges:[]},current),/第 2 行.*HH:mm/);
 const before=JSON.stringify(current);assert.throws(()=>parseSheet({name:'no-course',rows:[['课程名','星期','节次','上课时间','下课时间'],['坏课程','周八','1','',''],['','','1','08:00','08:45']],merges:[]},current),/周八/);assert.equal(JSON.stringify(current),before);
});

test('新增节次必须提供完整时间，完整表缩减不能容纳的导入课程给出错误',()=>{
 const before={...current,periods:current.periods.slice(0,4)};
 assert.throws(()=>parseSheet({name:'missing-new',rows:csvRows('节次,上课时间,下课时间\n6,14:55,15:40'),merges:[]},before),/第 5 节.*完整起止时间/);
 assert.throws(()=>parseSheet({name:'unknown-middle',rows:csvRows('课程名,星期,节次,上课时间,下课时间\n数学,Mon,5-6,14:00,15:40'),merges:[]},before),/第 5 节.*不能推算/);
 assert.throws(()=>parseSheet({name:'short-table',rows:[['课程名','星期','节次','上课时间','下课时间'],['数学','Mon','5-6','',''],['','','1','08:00','08:45'],['','','2','08:55','09:40']],merges:[]},current),/只有 2 节.*课程安排超出/);
});

test('矩阵课表时间列和Excel使用相同时间模型，缺失时间列旧CSV保持兼容',async()=>{
 const rows=[['节次','上课时间','下课时间','周一','周二'],['1','8:05','8:50','数学','英语'],['2','9:00','9:45','','英语']];
 const csv=parseSheet({name:'matrix',rows,merges:[]},current);assert.equal(csv.blocks,3);assert.deepEqual(csv.schedule.periods,[{start:'08:05',end:'08:50'},{start:'09:00',end:'09:45'}]);
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'课程和时间');const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'matrix-times.xlsx');
 const excel=parseFileSource(await readScheduleFile(file),current);assert.deepEqual(excel.schedule.periods,csv.schedule.periods);assert.equal(excel.blocks,csv.blocks);
 const old=parseSheet({name:'no-times',rows:csvRows('课程名,星期,节次\n数学,Mon,1-2'),merges:[]},current);assert.deepEqual(old.schedule.periods,current.periods);assert.equal(old.blocks,1);
 const grouped=parseSheet({name:'range-matrix',rows:[rows[0],['1-2','08:05','09:45','数学','英语'],['3-4','10:05','11:45','数学','']],merges:[]},current);
 assert.equal(grouped.blocks,3);assert.equal(grouped.schedule.periods.length,current.periods.length);assert.equal(grouped.schedule.periods[0].start,'08:05');assert.equal(grouped.schedule.periods[1].end,'09:45');assert.equal(grouped.schedule.periods[0].end,current.periods[0].end);assert.equal(grouped.schedule.periods[1].start,current.periods[1].start);assert.equal(grouped.schedule.courses[0].end,2);assert.equal(grouped.schedule.courses[2].end,4);
});

const lunchClocks=[['07:30','08:10'],['08:20','09:00'],['09:20','10:00'],['10:10','10:50'],['13:10','13:50'],['14:00','14:40']].map(([start,end])=>({start,end}));
test('JSON 自动识别时间段及夹在课时之间的午休，休息不改变课程编号',()=>{
 const entries=lunchClocks.map((p,i)=>({index:i+1,timeRange:`${p.start} 至 ${p.end}`}));
 entries.splice(4,0,{label:'午休',timeRange:'11:00–13:10'} as unknown as typeof entries[number]);
 const result=normalizeSchedule({courseCount:6,times:entries,courses:[{...course,start:5,end:6}]},current);
 assert.equal(result.periods.length,6);assert.equal(result.courses[0].start,5);
 assert.deepEqual(result.periods[3].breakAfter,{label:'午休',start:'11:00',end:'13:10'});
 assert.equal(result.periods[4].start,'13:10');assert.equal(gridRows(result.periods)[3].breakMinutes,140);
 const committed=parseImport(JSON.stringify(result),'json',current,{allowEmpty:true,preserveCourseIds:true});assert.deepEqual(committed.periods,result.periods);
});
test('JSON 支持时间字符串、独立 lunchBreak 及中文作息字段，缺省午休由时刻间隔识别',()=>{
 for(const raw of [{times:lunchClocks.map(p=>`${p.start}-${p.end}`),lunchBreak:'11:05-13:00'},{作息时间:lunchClocks.map(p=>({上课时间:p.start,下课时间:p.end})),午休:{开始时间:'11:05',结束时间:'13:00'}}]){
  const result=normalizeSchedule(raw,current);assert.deepEqual(periodRest(result.periods,3),{label:'午休',start:'11:05',end:'13:00'});assert.deepEqual(result.courses,current.courses);
 }
 const inferred=normalizeSchedule({times:lunchClocks},current);assert.deepEqual(periodRest(inferred.periods,3),{label:'午休',start:'10:50',end:'13:10'});
});
test('CSV 识别午休行和合并时间列，完整时间表决定节数且不创建午休课程',()=>{
 const rows=csvRows('时段,时间\n'+lunchClocks.map((p,i)=>`${i+1},${p.start}–${p.end}`).toSpliced(4,0,'午休,11:00–13:10').join('\n'));
 const result=parseSheet({name:'time',rows,merges:[]},current);assert.equal(result.blocks,0);assert.equal(result.schedule.periods.length,6);assert.equal(result.schedule.periods[4].start,'13:10');assert.deepEqual(periodRest(result.schedule.periods,3),{label:'午休',start:'11:00',end:'13:10'});
 const english=parseSheet({name:'mixed',rows:csvRows('课程名,星期,节次,时间\n数学,Wed,5-6,14:05–15:45\n,,4,10:55–11:40\n,,Lunch Break,12:00–14:00'),merges:[]},current);assert.equal(english.blocks,1);assert.equal(english.schedule.periods[4].start,'14:05');assert.deepEqual(periodRest(english.schedule.periods,3),{label:'午休',start:'12:00',end:'14:00'});
});
test('Excel 矩阵共用时间解析，午休行跨星期不生成课程',()=>{
 const rows=[['节次','上课时间','下课时间','周一','周二'],...lunchClocks.map((p,i)=>[String(i+1),p.start,p.end,i===4?'数学':'',''])];rows.splice(5,0,['午休','11:00','13:10','休息','休息']);
 const result=parseSheet({name:'matrix',rows,merges:[]},current);assert.equal(result.blocks,1);assert.equal(result.schedule.periods.length,6);assert.equal(result.schedule.courses[0].start,5);assert.deepEqual(periodRest(result.schedule.periods,3),{label:'午休',start:'11:00',end:'13:10'});
});
test('JSON 课程时钟与 CSV 使用相同的边界规则，不推算连堂内部',()=>{
 const result=normalizeSchedule({courses:[{...course,start:5,end:6,time:'14:05–15:45'}]},current);assert.equal(result.periods[4].start,'14:05');assert.equal(result.periods[5].end,'15:45');assert.equal(result.periods[4].end,current.periods[4].end);
 assert.throws(()=>normalizeSchedule({times:current.periods,courses:[{...course,start:5,end:6,time:'14:05–15:45'}]},current),/完整节次时间表不一致/);
});
test('午休和课程重叠、午休缺半对、时间写法不一致和同一休息区间冲突均阻止导入',()=>{
 assert.throws(()=>normalizeSchedule({times:lunchClocks,lunchBreak:'10:30–13:10'},current),/午休.*重叠/);
 assert.throws(()=>normalizeSchedule({times:lunchClocks,lunchBreak:{start:'11:00'}},current),/必须同时填写/);
 assert.throws(()=>normalizeSchedule({times:[{start:'08:00',end:'08:45',time:'08:05–08:45'}]},current),/不一致/);
 assert.throws(()=>parseSheet({name:'bad',rows:csvRows('节次,时间\n午休,11:00–14:30'),merges:[]},current),/午休.*重叠/);
 assert.throws(()=>normalizeSchedule({times:lunchClocks,breaks:[{label:'午休',start:'11:00',end:'13:10'},{label:'午休',start:'11:10',end:'13:10'}]},current),/休息时间存在冲突/);
});
test('午休子区间从备份恢复，部分更新时间只移除过期注释，旧数据仍自动识别休息',()=>{
 const result=normalizeSchedule({times:lunchClocks,lunchBreak:'11:00–13:10'},current);
 const shrunk=resizePeriods(result.periods,4);assert.equal(shrunk[3].breakAfter,undefined);
 const moved=retimePeriods(result.periods,'07:40');assert.deepEqual(periodRest(moved,3),{label:'午休',start:'11:10',end:'13:20'});
 const old=normalizeSchedule({courses:[course]},current);assert.deepEqual(old.periods,current.periods);assert.equal(periodRest(old.periods,3)?.label,'午休');
});

test('当前时间按自定义课时和午休映射，开始/结束/连续课时边界一致',()=>{
 const periods=[{start:'08:00',end:'08:15'},{start:'08:25',end:'09:55'},{start:'13:30',end:'14:15'},{start:'14:15',end:'15:00'}];
 const at=(hour:number,minute:number)=>currentTimePosition(periods,new Date(2026,9,7,hour,minute));
 assert.deepEqual(at(8,0),{section:1,phase:'lesson',progress:0});
 assert.deepEqual(at(8,5),{section:1,phase:'lesson',progress:1/3});
 assert.deepEqual(at(8,15),{section:1,phase:'break',progress:0,nextSection:2});
 assert.deepEqual(at(8,20),{section:1,phase:'break',progress:.5,nextSection:2});
 assert.deepEqual(at(9,10),{section:2,phase:'lesson',progress:.5});
 assert.deepEqual(at(11,42),{section:2,phase:'break',progress:107/215,nextSection:3});
 assert.deepEqual(at(13,30),{section:3,phase:'lesson',progress:0});
 assert.deepEqual(at(14,15),{section:4,phase:'lesson',progress:0});
 assert.deepEqual(at(15,0),{section:4,phase:'lesson',progress:1});
 assert.equal(at(7,59),undefined);assert.equal(at(15,1),undefined);
});
test('旧无时间分组与空作息不产生错误时间线，已有时间仍可定位',()=>{
 const periods=[{start:'08:00',end:'08:45'},{start:'',end:'',label:'午间'},{start:'13:30',end:'14:15'}];
 assert.deepEqual(currentTimePosition(periods,new Date(2026,9,7,8,30)),{section:1,phase:'lesson',progress:2/3});
 assert.deepEqual(currentTimePosition(periods,new Date(2026,9,7,12,0)),{section:1,phase:'break',progress:195/285,nextSection:3});
 assert.equal(currentTimePosition([],new Date()),undefined);assert.equal(currentTimePosition([{start:'',end:''}],new Date()),undefined);
});
test('旧偏好默认启用当前时间线，已关闭的偏好在迁移中保留',()=>{
 const old={...initialData().settings};delete old.showCurrentTimeLine;
 assert.equal(migrateDisplay(old).showCurrentTimeLine,true);
 assert.equal(migrateDisplay({...old,showCurrentTimeLine:false}).showCurrentTimeLine,false);
});
