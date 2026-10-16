import assert from 'node:assert/strict';
import test from 'node:test';
import {previewConflicts} from '../web/src/lib/importPreview';
import {initialData,type Course} from '../web/src/lib/model';

const course=(id:string,patch:Partial<Course>={}):Course=>({id,name:'同名课程',teacher:'',room:'',notes:'',day:1,start:1,end:2,weeks:[1,2],color:'sage',...patch});
test('同名课程的所有冲突具有唯一ID，原课程完整保留',()=>{
 const schedule=initialData().schedule;schedule.courses=[course('a'),course('b'),course('c')];const before=structuredClone(schedule);
 const result=previewConflicts(schedule);assert.equal(result.length,3);assert.equal(new Set(result.map(pair=>pair.id)).size,3);
 assert.ok(result.every(pair=>pair.label==='同名课程 / 同名课程'));assert.deepEqual(schedule,before);
});
test('导入冲突继续使用实际周次、日期、节次，最多提示20对但不截断课程',()=>{
 const schedule=initialData().schedule;schedule.term.startDate='2026-10-05';
 schedule.courses=[course('a'),course('other-week',{weeks:[3]}),course('other-day',{day:2}),course('other-period',{start:3,end:4}),course('temporary',{specificDate:'2026-10-05'}),course('later',{specificDate:'2026-10-26'})];
 assert.deepEqual(previewConflicts(schedule),[{id:'["a","temporary"]',label:'同名课程 / 同名课程'}]);
 schedule.courses=Array.from({length:2000},(_,i)=>course(String(i)));const before=structuredClone(schedule);
 assert.equal(previewConflicts(schedule).length,20);assert.deepEqual(schedule,before);
});
