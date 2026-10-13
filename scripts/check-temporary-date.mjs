import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1],url=process.env.TEST_URL??'http://127.0.0.1:5173';
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Singapore'}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const editor=()=>page.getByRole('dialog',{name:/^(添加临时课程|编辑课程)$/}),date=()=>editor().getByLabel('日期（留空按周次重复）',{exact:true}),weekday=()=>editor().getByRole('button',{name:'星期',exact:true});
async function pass(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);r.result.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));}
async function selectWeekday(name){await weekday().click();await page.getByRole('option',{name,exact:true}).click();}
async function add(name){await goTab(page,'列表');await page.getByRole('button',{name:'添加临时课程',exact:true}).click();await editor().getByRole('textbox',{name:'课程名',exact:true}).fill(name);}
async function save(){await editor().getByRole('button',{name:'保存课程',exact:true}).click();await editor().waitFor({state:'detached'});}
async function edit(name){await goTab(page,'搜索');await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill(name);await page.locator('.screen.active .result-card').filter({hasText:name}).click();await page.getByRole('button',{name:'编辑这门课程',exact:true}).click();await editor().waitFor();}
try{
 await page.clock.setFixedTime(new Date('2026-10-05T01:00:00Z'));await page.goto(url);await page.locator('.load-note').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
  const {initialData}=await import('/src/lib/model.ts'),data=initialData();data.onboarded=true;data.schedule.term={name:'临时日期验证',startDate:'2026-10-05',weeks:8};Object.assign(data.settings,{autoUpdate:false,timetableMode:'list',mode:'light'});
  data.schedule.courses=[{id:'existing-temporary',name:'已有临时日期课',teacher:'原教师',room:'测试楼101',day:5,start:5,end:6,weeks:[1],color:'blue',notes:'原备注',temporary:true,specificDate:'2026-10-09'}];data.books={'已有临时日期课':{title:'原教材',publisher:'',edition:'',text:'',source:'manual'}};
  const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');tx.oncomplete=resolve;});db.close();
 });await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});const original=await state();
 await add('新临时日期课');
 await pass('临时课程日期从周一改为周三，星期立即同步且不写数据库',async()=>{
  assert.equal(await date().inputValue(),'2026-10-05');assert.equal(await weekday().innerText(),'周一');await date().fill('2026-10-07');assert.equal(await weekday().innerText(),'周三');assert.deepEqual(await state(),original);
 });
 await pass('跨周与星期选择双向一致，日期更改保留其他草稿字段',async()=>{
  await editor().getByRole('textbox',{name:'教室',exact:true}).fill('测试楼202');await date().fill('2026-10-18');assert.equal(await weekday().innerText(),'周日');await selectWeekday('周一');assert.equal(await date().inputValue(),'2026-10-12');assert.equal(await weekday().innerText(),'周一');assert.equal(await editor().getByRole('textbox',{name:'教室',exact:true}).inputValue(),'测试楼202');
 });
 await pass('实际保存新临时课的日期、星期、周次与显示一致',async()=>{
  await save();const saved=(await state()).schedule.courses.find(course=>course.name==='新临时日期课');assert.equal(saved.specificDate,'2026-10-12');assert.equal(saved.day,1);assert.deepEqual(saved.weeks,[2]);assert.equal(saved.temporary,true);assert.equal(saved.room,'测试楼202');
 });
 await add('清空日期重复课');
 await pass('清空日期保留用户星期，恢复周次输入并按用户周次保存重复课程',async()=>{
  await selectWeekday('周五');assert.equal(await date().inputValue(),'2026-10-09');await date().fill('');assert.equal(await weekday().innerText(),'周五');await editor().getByRole('textbox',{name:'周次',exact:true}).fill('1-4单');await save();const saved=(await state()).schedule.courses.find(course=>course.name==='清空日期重复课');assert.ok(!saved.specificDate);assert.equal(saved.day,5);assert.deepEqual(saved.weeks,[1,3]);assert.equal(saved.temporary,true);
 });
 await edit('已有临时日期课');
 await pass('已有临时课跨年改日期同步星期，继续编辑保留草稿及原存储',async()=>{
  assert.equal(await date().inputValue(),'2026-10-09');assert.equal(await weekday().innerText(),'周五');await editor().locator('.course-optional').evaluate(element=>element.open=true);await editor().getByRole('textbox',{name:'教师',exact:true}).fill('更新教师');await editor().getByRole('textbox',{name:'备注',exact:true}).fill('更新备注');await date().fill('2027-01-03');assert.equal(await weekday().innerText(),'周日');await editor().getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('dialog',{name:'修改还未保存',exact:true}).getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await date().inputValue(),'2027-01-03');assert.equal(await weekday().innerText(),'周日');assert.equal(await editor().getByRole('textbox',{name:'教师',exact:true}).inputValue(),'更新教师');assert.deepEqual((await state()).schedule.courses.find(course=>course.id==='existing-temporary'),original.schedule.courses[0]);
 });
 await pass('保存已有草稿保留ID、节次、配色、教材，只更新明确修改字段',async()=>{
  await save();const data=await state(),saved=data.schedule.courses.find(course=>course.id==='existing-temporary');assert.equal(saved.specificDate,'2027-01-03');assert.equal(saved.day,7);assert.equal(saved.name,'已有临时日期课');assert.equal(saved.start,5);assert.equal(saved.end,6);assert.equal(saved.color,'blue');assert.equal(saved.room,'测试楼101');assert.equal(saved.teacher,'更新教师');assert.equal(saved.notes,'更新备注');assert.deepEqual(data.books,original.books);
 });
 await edit('已有临时日期课');
 await pass('已有临时课清空日期转周次重复，清空前选择的星期与ID保持',async()=>{
  await selectWeekday('周四');assert.equal(await date().inputValue(),'2026-12-31');await date().fill('');assert.equal(await weekday().innerText(),'周四');await editor().getByRole('textbox',{name:'周次',exact:true}).fill('2-8双');await save();const data=await state(),saved=data.schedule.courses.find(course=>course.id==='existing-temporary');assert.ok(!saved.specificDate);assert.equal(saved.day,4);assert.deepEqual(saved.weeks,[2,4,6,8]);assert.equal(saved.temporary,true);assert.deepEqual(data.books,original.books);assert.equal(data.schedule.courses.length,3);
 });
 await edit('已有临时日期课');
 await pass('重新指定有效日期并放弃编辑，重复课程仍保持原存储',async()=>{
  const before=await state();await date().fill('2026-10-14');assert.equal(await weekday().innerText(),'周三');assert.equal(await editor().getByRole('textbox',{name:'周次',exact:true}).count(),0);await mkdir('build/evidence',{recursive:true});await page.screenshot({path:`build/evidence/${version}-temporary-date-after.png`});await editor().getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('dialog',{name:'修改还未保存',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();assert.deepEqual(await state(),before);
 });
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile(`build/evidence/${version}-temporary-date-results.json`,JSON.stringify({version,completed:true,checks,errors,scope:'隔离浏览器和虚构临时课；日期/星期/周次双向交互、真实保存、既有ID/教材与未保存保护'},null,2));
}finally{await browser.close();}
