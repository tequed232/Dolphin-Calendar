import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData,coursesOn,parseDate} from '../web/src/lib/model.ts';
import {normalizeSchedule,parseImport,parseNumbers} from '../web/src/lib/import.ts';
import {csvRows,parseSheet,parseJSONPreview} from '../web/src/lib/fileImport.ts';

const current={...initialData().schedule,term:{name:'恢复测试',startDate:'2026-09-07',weeks:20}};
const course={name:'交替周课程',day:1,start:1,end:2,weeks:'1-9单,10-16双'};

test('每段周次独立应用单双周，显式单周段、双周段和普通周次不相互过滤',()=>{
 assert.deepEqual(parseNumbers('第1-9周(单)，第10-16周(双)',20,'周次'),[1,3,5,7,9,10,12,14,16]);
 assert.deepEqual(parseNumbers('1,2,3-7单,10-16双,19',20,'周次'),[1,2,3,5,7,10,12,14,16,19]);
 assert.deepEqual(parseNumbers(['1-7单','8-14双',16],20,'周次'),[1,3,5,7,8,10,12,14,16]);
 assert.throws(()=>parseNumbers('1-8单双',20,'周次'),/单双周/);
});

test('JSON与CSV导入混合单双周后，在实际日期显示原文安排的课程',()=>{
 const json=normalizeSchedule({courses:[course]},current);
 const csv=parseSheet({name:'混合单双周',rows:csvRows('课程名,星期,节次,周次\n交替周课程,周一,1-2,"1-9单,10-16双"'),merges:[]},current).schedule;
 for(const schedule of [json,csv]){
  assert.deepEqual(schedule.courses[0].weeks,[1,3,5,7,9,10,12,14,16]);
  assert.equal(coursesOn(schedule,parseDate('2026-11-09')).length,1); // 第10周
  assert.equal(coursesOn(schedule,parseDate('2026-11-16')).length,0); // 第11周
 }
});

test('显式空周次数组须报告问题，不能擅自扩大为整学期；预览保留其他合法行',()=>{
 assert.throws(()=>parseNumbers([],20,'周次'),/周次.*没有可用数字/);
 assert.throws(()=>parseNumbers([[]],20,'周次'),/周次.*没有可用数字/);
 assert.throws(()=>normalizeSchedule({courses:[{...course,weeks:[]}]},current),/第 1 条课程.*周次/);
 const preview=parseJSONPreview(JSON.stringify({courses:[{...course,weeks:[]},{...course,name:'合法课程',weeks:[1,3]}]}),current);
 assert.equal(preview.blocks,1);assert.equal(preview.errors.length,1);
 assert.equal(preview.schedule.courses[0].name,'合法课程');assert.deepEqual(preview.schedule.courses[0].weeks,[1,3]);
});

test('完整备份的显式空周次原值保留，含原ID、隐藏课节与指定日期课程',()=>{
 const saved={id:'old-empty-weeks',name:'旧备份保留课程',teacher:'原教师',room:'16-203/202',day:1,start:11,end:12,weeks:[],color:'sage',notes:'暂不按周重复'};
 const dated={...saved,id:'dated-empty-weeks',name:'指定日期课程',day:3,start:1,end:2,temporary:true,specificDate:'2026-09-09'};
 const backup={...current,term:{...current.term,weeks:5},periods:current.periods.slice(0,8),courses:[saved,dated]};
 for(const target of [current,backup]){
  const preview=parseJSONPreview(JSON.stringify(backup),target).schedule;
  assert.deepEqual(preview.courses,backup.courses);assert.deepEqual(preview.periods,backup.periods);assert.deepEqual(preview.term,backup.term);
  const committed=parseImport(JSON.stringify(preview),'json',target,{allowEmpty:true,preserveCourseIds:true});
  assert.deepEqual(committed.courses,backup.courses);
  assert.deepEqual(coursesOn(committed,parseDate('2026-09-09')).map(value=>value.id),['dated-empty-weeks']);
 }
 assert.throws(()=>normalizeSchedule({courses:[{...saved,id:undefined}]},current),/周次/);
 assert.throws(()=>parseJSONPreview(JSON.stringify({...backup,courses:[{...saved,weeks:[[]]}]}),current),/周次/);
});

test('只更新配置后确认完整快照保留已有空周次数组，不扩为整学期或拒绝保存',()=>{
 const saved={id:'config-empty-weeks',name:'暂停重复的原课程',teacher:'原教师',room:'原教室',day:1,start:11,end:12,weeks:[],color:'rose',notes:'原备注'};
 const before={...current,courses:[saved]};
 const preview=normalizeSchedule({courseCount:8},before);
 assert.deepEqual(preview.courses,before.courses);
 const committed=parseImport(JSON.stringify(preview),'json',before,{allowEmpty:true,preserveCourseIds:true});
 assert.deepEqual(committed.courses,before.courses);assert.equal(committed.periods.length,8);
});

type Scenario={saved?:unknown;failOpen?:boolean;blocked?:boolean};
async function storageScenario(scenario:Scenario,run:(storage:typeof import('../web/src/lib/storage.ts'),state:{opens:number;closed:number;callbackErrors:unknown[];database:any;requests:any[]})=>Promise<void>){
 const original=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
 const state={opens:0,closed:0,callbackErrors:[] as unknown[],database:null as any,requests:[] as any[]};
 const database={objectStoreNames:{contains:()=>true},close:()=>{state.closed++;},onversionchange:null as null|(()=>void),onclose:null as null|(()=>void),transaction:()=>({objectStore:()=>({get:()=>{
  const request:any={result:scenario.saved,error:null};
  queueMicrotask(()=>{try{request.onsuccess?.();}catch(error){state.callbackErrors.push(error);}});return request;
 }})})};state.database=database;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{
  state.opens++;const attempt=state.opens,request:any={result:database,error:new Error('暂时不可用')};
  state.requests.push(request);
  queueMicrotask(()=>{if(attempt===1&&scenario.failOpen)request.onerror?.();else if(attempt===1&&scenario.blocked)request.onblocked?.();else request.onsuccess?.();});return request;
 }}});
 try{
  const storage=await import(new URL(`../web/src/lib/storage.ts?recovery=${crypto.randomUUID()}`,import.meta.url).href);
  await run(storage,state);
 }finally{if(original)Object.defineProperty(globalThis,'indexedDB',original);else delete (globalThis as any).indexedDB;}
}

test('首次数据库打开失败不永久缓存失败；下一次读取能恢复原课程与偏好',async()=>{
 const saved=initialData();saved.settings.scale=1.1;saved.schedule.term.name='已保存学期';
 await storageScenario({saved,failOpen:true},async(storage,state)=>{
  await assert.rejects(storage.loadData(),/暂时不可用/);
  const recovered=await storage.loadData();assert.equal(state.opens,2);assert.equal(recovered.settings.scale,1.1);assert.equal(recovered.schedule.term.name,'已保存学期');
 });
});

test('数据库被其他窗口阻塞后也能重试，不持有失败连接',async()=>{
 await storageScenario({saved:initialData(),blocked:true},async(storage,state)=>{
  await assert.rejects(storage.loadData(),/另一个窗口/);
  assert.equal((await storage.loadData()).schema,1);assert.equal(state.opens,2);
 });
});

test('数据库版本变化释放旧连接，下一次读取重新建立连接',async()=>{
 await storageScenario({saved:initialData()},async(storage,state)=>{
  await storage.loadData();assert.equal(typeof state.database.onversionchange,'function');
  state.database.onversionchange();assert.equal(state.closed,1);
  await storage.loadData();assert.equal(state.opens,2);
 });
});

test('数据库异常关闭释放缓存，下一次读取使用新连接',async()=>{
 await storageScenario({saved:initialData()},async(storage,state)=>{
  await storage.loadData();assert.equal(typeof state.database.onclose,'function');
  state.database.onclose();await storage.loadData();assert.equal(state.opens,2);
 });
});

test('被阻塞的旧打开请求迟到成功时释放其句柄，不覆盖恢复后的连接',async()=>{
 await storageScenario({saved:initialData(),blocked:true},async(storage,state)=>{
  await assert.rejects(storage.loadData(),/另一个窗口/);
  await storage.loadData();assert.equal(state.opens,2);
  state.requests[0].onsuccess();assert.equal(state.closed,1);
  await storage.loadData();assert.equal(state.opens,2);
 });
});

test('读取损坏快照能明确失败，结束加载而不是回调抛错后永远停在启动画面',async()=>{
 const saved={...initialData(),schedule:{...current,courses:null}};
 await storageScenario({saved},async storage=>{
  let timer:ReturnType<typeof setTimeout>;
  const result=await Promise.race([
   storage.loadData().then(()=>({kind:'resolved'}),error=>({kind:'rejected',error})),
   new Promise<{kind:string}>(resolve=>{timer=setTimeout(()=>resolve({kind:'pending'}),60);})
  ]);clearTimeout(timer!);
  assert.equal(result.kind,'rejected');
 });
});

test('读取合法旧快照时保留课程ID、教材和迁移前偏好',async()=>{
 const saved=initialData();saved.schedule.courses=[{id:'kept',name:'原课程',teacher:'原教师',room:'原教室',day:1,start:1,end:2,weeks:[1,3],color:'sage',notes:'原备注'}];
 saved.books={kept:{title:'原教材',publisher:'',edition:'',text:'',source:'manual'}};saved.settings.scale=1.1;
 await storageScenario({saved},async storage=>{
  const result=await storage.loadData();assert.deepEqual(result.schedule.courses,saved.schedule.courses);assert.deepEqual(result.books,saved.books);assert.equal(result.settings.scale,1.1);
 });
});
