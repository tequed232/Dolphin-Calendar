import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1304,height:892},timezoneId:'Asia/Singapore'}),checks=[],errors=[],measurement={courseCount:700,periodCount:24,dateChanges:[]};
const active=()=>page.locator('.screen.active');
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 const NativeDate=Date;window.dateAllocations=0;window.Date=class extends NativeDate{constructor(...args){window.dateAllocations++;super(...(args.length?args:[Date.parse('2026-10-05T01:00:00Z')]));}static now(){return Date.parse('2026-10-05T01:00:00Z');}};
 const start=setInterval,stop=clearInterval;window.homeTimers=new Set();window.setInterval=function(callback,delay,...args){const id=start(callback,delay,...args);if(delay===30000&&new Error().stack.includes('/src/screens/Home.tsx'))window.homeTimers.add(id);return id;};window.clearInterval=function(id){window.homeTimers.delete(id);return stop(id);};
});
async function pass(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);r.result.close();};};}));}
async function frames(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
try{
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await page.evaluate(async()=>{
  const {initialData,PALETTE}=await import('/src/lib/model.ts'),data=initialData();data.onboarded=true;Object.assign(data.settings,{autoUpdate:false,timetableMode:'list',showWeekend:false,mode:'light',showCurrentTimeLine:false});data.schedule.term={name:'700课程性能验证',startDate:'2026-10-05',weeks:40};
  data.schedule.periods=Array.from({length:24},(_,i)=>{const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return {start:time(i*40),end:time(i*40+35)};});data.schedule.courses=Array.from({length:700},(_,i)=>({id:'perf-'+i,name:'性能课程 '+i,teacher:'示例老师',room:'示例楼',day:i%7+1,start:i%24+1,end:i%24+1,weeks:[i%10+1,i%10+11,i%10+21,i%10+31],color:PALETTE[i%5],notes:''}));
  const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');tx.oncomplete=resolve;});db.close();
 });
 await page.reload();await active().locator('.home-inner').waitFor();await page.waitForTimeout(400);const before=(await state()).schedule;
 await pass('700课程24节日期切换不重新枚举全部课程出现日期，时间只作观察记录',async()=>{
  for(let i=0;i<9;i++){
   measurement.dateChanges.push(await page.evaluate(async i=>{const date=i%2?'2026-10-05':'2026-10-06',button=document.querySelector(`.screen.active .date-item[data-date="${date}"]`);window.dateAllocations=0;const start=performance.now();button.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {milliseconds:performance.now()-start,dates:window.dateAllocations,selected:document.querySelector('.screen.active .home-inner').dataset.focusDate};},i));await page.waitForTimeout(150);
  }
  assert.ok(measurement.dateChanges.every(sample=>sample.dates<measurement.courseCount),'切日期不应重新计算700课的完整学期出现日期');const sorted=measurement.dateChanges.map(sample=>sample.milliseconds).sort((a,b)=>a-b);measurement.dateChangeP50=sorted[4];measurement.dateChangeP95=sorted[8];assert.deepEqual((await state()).schedule,before);
 });
 await page.evaluate(()=>{const original=Element.prototype.getBoundingClientRect;window.layoutReads=0;Element.prototype.getBoundingClientRect=function(){window.layoutReads++;return original.call(this);};window.laneLayouts=0;const sort=Array.prototype.sort;Array.prototype.sort=function(...args){if(new Error().stack.includes('layoutCourses'))window.laneLayouts++;return sort.apply(this,args);};});
 await pass('同帧60次滚动事件不同步读布局，下一帧只采样一次焦点',async()=>{
  measurement.singleScrollReads=await active().evaluate(async el=>{window.layoutReads=0;el.dispatchEvent(new Event('scroll'));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return window.layoutReads;});
  measurement.scrollReadsSynchronous=await active().evaluate(el=>{window.layoutReads=0;for(let i=0;i<60;i++)el.dispatchEvent(new Event('scroll'));return window.layoutReads;});assert.equal(measurement.scrollReadsSynchronous,0);await frames();measurement.scrollReadsAfterFrame=await page.evaluate(()=>window.layoutReads);assert.ok(measurement.singleScrollReads>0);assert.equal(measurement.scrollReadsAfterFrame,measurement.singleScrollReads);
 });
 await pass('显式选择日期取消待处理滚动采样，焦点与日期不会被旧任务覆盖',async()=>{
  const focus=await active().evaluate(async el=>{el.dispatchEvent(new Event('scroll'));el.querySelector('.date-item[data-date="2026-10-07"]').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return el.querySelector('.home-inner').dataset.focusDate;});assert.equal(focus,'2026-10-07');assert.equal(await active().locator('.date-item.selected').getAttribute('data-date'),'2026-10-07');
 });
 await pass('只保留活动课表的时钟，搜索/设置暂停且往返保留数据',async()=>{
  assert.equal(await page.evaluate(()=>window.homeTimers.size),1);await goTab(page,'搜索');assert.equal(await page.evaluate(()=>window.homeTimers.size),0);await goTab(page,'设置');assert.equal(await page.evaluate(()=>window.homeTimers.size),0);await goTab(page,'平铺');assert.equal(await page.evaluate(()=>window.homeTimers.size),1);assert.deepEqual((await state()).schedule,before);
 });
 await pass('同一单元格30次指针移动不重新排冲突lane，取消拖动不写数据',async()=>{
  const card=active().locator('.grid-course').first();await card.locator('.layout-entry').evaluate(el=>el.click());await frames();await card.scrollIntoViewIfNeeded();await page.waitForTimeout(150);const box=await card.locator('.grid-course-content').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+9,box.y+box.height/2);await frames();await page.evaluate(()=>window.laneLayouts=0);
  for(let i=0;i<30;i++)await page.mouse.move(box.x+box.width/2+9+i%2,box.y+box.height/2);await frames();measurement.stationaryDragLayouts=await page.evaluate(()=>window.laneLayouts);assert.equal(measurement.stationaryDragLayouts,0);await page.mouse.up();await frames();assert.deepEqual((await state()).schedule,before);
 });
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile(`build/evidence/${version}-performance-results.json`,JSON.stringify({version,completed:true,checks,measurement,errors,scope:'隔离浏览器、700门虚构课程、24节；计数断言防性能回退，耗时不设机器相关阈值'},null,2));
}finally{await browser.close();}
