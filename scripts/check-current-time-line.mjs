import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',hasTouch:true}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{window.commands=[];window.Dolphin={postMessage(raw){window.commands.push(JSON.parse(raw));}};});
await page.route('https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest',route=>route.fulfill({json:{tag_name:'v1.4.3',html_url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v1.4.3'}}));
const active=()=>page.locator('.screen.active'),line=()=>active().locator('.current-time-line');
const periods=[['08:00','08:15'],['08:25','09:55'],['10:15','11:00'],['11:10','11:55'],['13:30','14:15'],['14:25','15:10'],['15:20','16:05'],['16:15','17:00']].map(([start,end])=>({start,end}));
periods[3].breakAfter={label:'午休',start:'11:55',end:'13:30'};
const course=(id,name,day,start,end)=>({id,name,day,start,end,weeks:[1,2,3],room:'16栋203号教室',teacher:'陈老师',color:'sage',notes:''});
const schedule={term:{name:'时间线验收',startDate:'2026-10-05',weeks:20},periods,courses:[course('wed','周三数学',3,5,6),course('mon','周一英语',1,1,2),course('fri','周五体育',5,7,8)]};
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function stored(){return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);db.close();};};}));}
async function clock(time){await page.clock.setFixedTime(new Date(time));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(80);}
async function showToolbar(){if(await active().locator('.grid-controls[data-toolbar-hidden=true]').count()){await active().evaluate(el=>el.scrollTop=Math.max(0,el.scrollTop-20));await page.waitForTimeout(250);}}
async function date(value){await showToolbar();await active().getByRole('button',{name:'选择日期',exact:true}).click();await page.getByRole('dialog',{name:'选择日期',exact:true}).locator(`.calendar-day[data-date="${value}"]`).click();await page.waitForTimeout(150);}
async function settings(){await goTab(page,'设置');await active().locator('[data-setting=appearance]').click();await active().locator('#show-current-time-line').waitFor();}
async function toggle(id,value){const input=active().locator('#'+id);if(await input.isChecked()!==value)await input.click();await page.waitForFunction(({id,value})=>document.getElementById(id)?.checked===value,{id,value});}
async function expected(section,phase,progress,next=section+1){
 const value=await active().evaluate((screen,{section,phase,progress,next})=>{
  const grid=screen.dataset.screen==='grid',row=screen.querySelector(grid?`.grid-period[data-period="${section}"]`:`.period-row[data-focus-section="${section}"]`),rect=row.getBoundingClientRect(),lesson=row.querySelector(grid?'.grid-period-time':'.period-content'),scale=screen.getBoundingClientRect().width/screen.offsetWidth;
  const end=grid?lesson.getBoundingClientRect().bottom:rect.bottom-parseFloat(getComputedStyle(lesson).paddingBottom)*scale;
  const nextRow=screen.querySelector(grid?`.grid-period[data-period="${next}"]`:`.period-row[data-focus-section="${next}"]`),from=phase==='lesson'?rect.top:end,to=phase==='lesson'?end:nextRow.getBoundingClientRect().top,l=screen.querySelector('.current-time-line').getBoundingClientRect();
  return {actual:l.top+l.height/2,expected:from+(to-from)*progress};
 },{section,phase,progress,next});
 assert.equal(await line().getAttribute('data-time-section'),String(section));assert.equal(await line().getAttribute('data-time-phase'),phase);assert.ok(Math.abs(value.actual-value.expected)<1,JSON.stringify(value));
}
async function viewLine(){await line().evaluate(el=>{const screen=el.closest('.screen'),r=el.getBoundingClientRect();screen.scrollTop+=r.top-400;});await page.waitForTimeout(250);}
async function importFile(path){await goTab(page,'平铺');await showToolbar();await active().getByRole('button',{name:'导入课表',exact:true}).click();await active().getByLabel('选择课表文件',{exact:true}).setInputFiles(path);const preview=page.getByRole('dialog',{name:'确认这份课表',exact:true});await preview.waitFor();await preview.getByRole('button',{name:'确认导入',exact:true}).click();await active().locator('.week-grid').waitFor();}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.install({time:new Date('2026-10-07T06:45:00Z')});await page.clock.setFixedTime(new Date('2026-10-07T06:45:00Z'));
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await page.evaluate(async schedule=>{const {initialData}=await import('/src/lib/model.ts'),{saveData}=await import('/src/lib/storage.ts');const data=initialData();delete data.settings.showCurrentTimeLine;data.onboarded=true;data.settings={...data.settings,autoUpdate:false,timetableMode:'list',mode:'light',performance:'high'};data.schedule=schedule;await saveData(data);},schedule);await page.reload();await active().locator('.timetable').waitFor();await line().waitFor();
 await check('旧偏好默认开启，今天列表与本周平铺均按自定义第6节当前时间定位',async()=>{assert.equal(await line().count(),1);assert.equal(await line().getAttribute('aria-label'),'当前时间 14:45');await expected(6,'lesson',20/45);await goTab(page,'平铺');await expected(6,'lesson',20/45);});
 await check('半透明苍绿色线覆盖课表宽度，浅/深色、320px和110%缩放仍对齐',async()=>{
  for(const mode of ['light','dark'])for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;document.querySelector('.app-shell').style.setProperty('--ui-scale','1.1');},mode);await page.waitForTimeout(120);await expected(6,'lesson',20/45);const style=await line().evaluate(el=>({color:getComputedStyle(el).backgroundColor,pointer:getComputedStyle(el).pointerEvents,height:parseFloat(getComputedStyle(el).height),width:el.getBoundingClientRect().width,parent:el.parentElement.getBoundingClientRect().width}));assert.equal(style.color,'rgba(159, 197, 175, 0.68)');assert.equal(style.pointer,'none');assert.ok(style.height<=3);assert.ok(Math.abs(style.width-style.parent)<1);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.querySelector('.app-shell').style.setProperty('--ui-scale','1'));await viewLine();await page.screenshot({path:'build/evidence/current-time-grid-dark.png'});
 });
 await check('15分钟课时、长课时、课间及午休分别按真实时间比例定位',async()=>{
  await clock('2026-10-07T00:05:00Z');await expected(1,'lesson',1/3);await clock('2026-10-07T01:10:00Z');await expected(2,'lesson',.5);await clock('2026-10-07T00:20:00Z');await expected(1,'break',.5);await clock('2026-10-07T04:42:30Z');await expected(4,'break',.5,5);await goTab(page,'列表');await expected(4,'break',.5,5);await clock('2026-10-07T06:45:00Z');await expected(6,'lesson',20/45);await page.evaluate(()=>document.documentElement.dataset.mode='light');await viewLine();await page.screenshot({path:'build/evidence/current-time-list-light.png'});
 });
 await check('查看其他日期的列表隐藏时间线，同周选其他日期的平铺仍显示；跨周隐藏',async()=>{
  await date('2026-10-09');assert.equal(await line().count(),0);await goTab(page,'平铺');await expected(6,'lesson',20/45);await showToolbar();await active().getByRole('button',{name:'下一周',exact:true}).click();assert.equal(await line().count(),0);await showToolbar();await active().getByRole('button',{name:'回到今天',exact:true}).click();await expected(6,'lesson',20/45);
 });
 await check('外观开关说明简洁，关闭对两种视图立即生效，刷新仍关闭且不改课表',async()=>{
  const before=(await stored()).schedule;await settings();assert.equal(await active().locator('#show-current-time-line').isChecked(),true);assert.match(await active().locator('label[for=show-current-time-line]').innerText(),/^当前时间线\n在今天的列表和本周的平铺课表中显示$/);await toggle('show-current-time-line',false);for(const mode of ['列表','平铺']){await goTab(page,mode);assert.equal(await line().count(),0);}await page.reload();await active().locator('.week-grid').waitFor();assert.equal(await line().count(),0);assert.equal((await stored()).settings.showCurrentTimeLine,false);assert.deepEqual((await stored()).schedule,before);await settings();await toggle('show-current-time-line',true);await page.screenshot({path:'build/evidence/current-time-setting.png'});await goTab(page,'列表');await expected(6,'lesson',20/45);
 });
 await check('课前/末课后不显示错误位置，首节与末节边界正确，未选中时间显示也可使用',async()=>{
  await goTab(page,'平铺');await clock('2026-10-06T23:59:00Z');assert.equal(await line().count(),0);await clock('2026-10-07T00:00:00Z');await expected(1,'lesson',0);await clock('2026-10-07T09:00:00Z');await expected(8,'lesson',1);await clock('2026-10-07T09:01:00Z');assert.equal(await line().count(),0);await clock('2026-10-07T06:45:00Z');
  await goTab(page,'设置');await active().locator('[data-setting=home-settings]').click();await toggle('show-times',false);await goTab(page,'平铺');assert.equal(await active().locator('.grid-period-time small').count(),0);await expected(6,'lesson',20/45);await goTab(page,'设置');await active().locator('[data-setting=home-settings]').click();await toggle('show-times',true);await goTab(page,'平铺');
 });
 await check('时间线不拦截课程点击、长按和Resize；编辑仍能完成退出',async()=>{
  await viewLine();const card=active().locator('[data-course-id=wed]'),box=await card.boundingBox(),l=await line().boundingBox();await page.mouse.click(box.x+box.width/2,l.y+l.height/2);await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();assert.equal(await page.locator('.resize-handle').count(),0);await page.mouse.move(box.x+box.width/2,l.y+l.height/2);await page.mouse.down();await page.waitForTimeout(550);await page.mouse.up();assert.equal(await page.locator('.resize-handle').count(),2);await page.getByRole('button',{name:'周三数学结束节次拖动',exact:true}).press('ArrowDown');await page.waitForTimeout(150);assert.equal((await stored()).schedule.courses.find(c=>c.id==='wed').end,7);await showToolbar();await active().getByRole('button',{name:'完成',exact:true}).click();assert.equal(await page.locator('.resize-handle').count(),0);
 });
 await check('定时更新时间线不重新定位、不读取课表、不保存课表或重发原生同步',async()=>{
  await viewLine();const before=await active().evaluate(el=>el.scrollTop),position=await line().evaluate(el=>parseFloat(el.style.top)),data=(await stored()).schedule;
  await page.evaluate(()=>{window.beforeCommands=window.commands.length;window.appReads=0;window.appWrites=0;const read=IDBObjectStore.prototype.get,write=IDBObjectStore.prototype.put;IDBObjectStore.prototype.get=function(key){if(key==='app')window.appReads++;return read.call(this,key);};IDBObjectStore.prototype.put=function(value,key){if(key==='app')window.appWrites++;return write.call(this,value,key);};});
  await page.clock.setFixedTime(new Date('2026-10-07T06:55:00Z'));await page.clock.runFor(30_100);await expected(6,'lesson',30/45);assert.ok(await line().evaluate(el=>parseFloat(el.style.top))>position);assert.ok(Math.abs(await active().evaluate(el=>el.scrollTop)-before)<1);const counts=await page.evaluate(()=>({reads:window.appReads,writes:window.appWrites,sync:window.commands.slice(window.beforeCommands).filter(c=>['sync','ready','reminders'].includes(c.type)).length}));assert.deepEqual(counts,{reads:0,writes:0,sync:0});assert.deepEqual((await stored()).schedule,data);await clock('2026-10-07T06:45:00Z');
 });
 await check('真实JSON自定义时间导入后时间线立即重算，沿用同一个作息源',async()=>{
  const imported={...schedule,periods:periods.map((p,i)=>i>=5?{...p,start:['14:35','15:30','16:25'][i-5],end:['15:20','16:15','17:10'][i-5]}:{...p})};await writeFile('build/evidence/current-time.json',JSON.stringify(imported));await importFile('build/evidence/current-time.json');await expected(6,'lesson',10/45);assert.equal((await stored()).schedule.periods[5].start,'14:35');await goTab(page,'列表');await expected(6,'lesson',10/45);await goTab(page,'平铺');
 });
 await check('真实CSV独立作息与午休导入同步时间线，刷新保留偏好与自定义时间',async()=>{
  const csv=['节次,上课时间,下课时间',...periods.map((p,i)=>`${i+1},${i>=5?['14:40','15:35','16:30'][i-5]:p.start},${i>=5?['15:25','16:20','17:15'][i-5]:p.end}`),'午休,11:55,13:30'].join('\n');await writeFile('build/evidence/current-time.csv',csv);await importFile('build/evidence/current-time.csv');await expected(6,'lesson',5/45);const before=(await stored()).schedule;assert.equal(before.periods[3].breakAfter.label,'午休');await page.reload();await active().locator('.week-grid').waitFor();await expected(6,'lesson',5/45);assert.equal((await stored()).settings.showCurrentTimeLine,true);assert.deepEqual((await stored()).schedule,before);
 });
 await check('午夜后尊重选中的旧日期，新一天当前时间只在本周平铺显示',async()=>{
  await goTab(page,'列表');await clock('2026-10-08T00:05:00Z');assert.equal(await active().locator('.home-inner').getAttribute('data-focus-date'),'2026-10-07');assert.equal(await line().count(),0);await goTab(page,'平铺');await expected(1,'lesson',1/3);
 });
 assert.deepEqual(errors,[]);await writeFile('build/evidence/current-time-line-results.json',JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
