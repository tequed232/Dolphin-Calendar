import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,timezoneId:'Asia/Singapore'}),page=await context.newPage(),cdp=await context.newCDPSession(page);
const checks=[],errors=[],geometry=[];
page.on('pageerror',error=>errors.push(error.message));
const home=()=>page.locator('.screen.active[data-screen="list"]'),strip=()=>home().locator('.date-strip'),picked=()=>strip().locator('[aria-pressed=true]');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function seed(scale=1,mode='light'){
 await page.evaluate(async({scale,mode})=>{
  const {initialData}=await import('/src/lib/model.ts'),data=initialData();data.onboarded=true;Object.assign(data.settings,{scale,mode,autoUpdate:false,timetableMode:'list',holidayMarkers:true});
  data.schedule.term={name:'竖向日期条验收',startDate:'2026-09-28',weeks:20};data.schedule.courses=[{id:'rail-course',name:'日期选择验证课',teacher:'虚构教师',room:'测试楼101',day:5,start:1,end:3,weeks:[1,2,3],color:'sage',notes:''}];
  data.holidayCalendarIds=['synthetic-holidays'];data.holidayRanges=[{from:'2026-01-01',to:'2026-12-31',calendarIds:['synthetic-holidays']}];data.holidays=[{date:'2026-10-02',kind:'rest',title:'虚构休息标记',source:'隔离测试日历'}];
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },{scale,mode});await page.reload();await home().waitFor();await picked().waitFor();await home().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(350);
}
async function model(){return page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);}),data=await new Promise(resolve=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result);});db.close();return {schedule:data.schedule,holidays:data.holidays,holidayRanges:data.holidayRanges};});}
async function visibleSelection(){await page.waitForFunction(()=>{const node=document.querySelector('.screen.active .date-strip'),selected=node?.querySelector('[aria-pressed=true]');if(!node||!selected)return false;const a=node.getBoundingClientRect(),b=selected.getBoundingClientRect();return node.dataset.orientation==='vertical'?b.top>=a.top-1&&b.bottom<=a.bottom+1:b.left>=a.left-1&&b.right<=a.right+1;});}
async function swipe(direction,cancel=false){
 const vertical=await strip().getAttribute('data-orientation')==='vertical',box=await strip().boundingBox(),before=await strip().evaluate((el,vertical)=>vertical?el.scrollTop:el.scrollLeft,vertical),selected=await picked().getAttribute('data-date');
 const start={x:box.x+box.width*(vertical?.5:direction<0?.8:.2),y:box.y+box.height*(vertical?(direction<0?.8:.2):.5)};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=12;i++){await page.waitForTimeout(20);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(vertical?0:box.width*direction*.6*i/12),y:start.y+(vertical?box.height*direction*.6*i/12:0)}]});}await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForTimeout(650);
 const after=await strip().evaluate((el,vertical)=>vertical?el.scrollTop:el.scrollLeft,vertical);assert.ok(direction<0?after>before+15:after<before-15,`真实${vertical?'纵':'横'}触摸应滚动：${before} → ${after}`);assert.equal(await picked().getAttribute('data-date'),selected);assert.equal(await strip().locator('.date-item').count(),181);
}
async function railGeometry(){return home().evaluate(screen=>{
 const rail=screen.querySelector('.day-date-panel').getBoundingClientRect(),region=screen.querySelector('.day-course-region').getBoundingClientRect(),nav=document.querySelector('.primary-navigation').getBoundingClientRect(),strip=screen.querySelector('.date-strip'),bounds=strip.getBoundingClientRect(),selected=strip.querySelector('[aria-pressed=true]').getBoundingClientRect();
 return {rail:{left:rail.left,right:rail.right,top:rail.top,bottom:rail.bottom},region:{left:region.left,right:region.right},nav:{left:nav.left,right:nav.right},strip:{width:bounds.width,height:bounds.height,scrollTop:strip.scrollTop,scrollLeft:strip.scrollLeft},selected:{left:selected.left,right:selected.right,top:selected.top,bottom:selected.bottom},overflow:document.documentElement.scrollWidth>innerWidth+1};
});}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date('2026-10-02T01:00:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
 for(const viewport of [{width:844,height:390},{width:1304,height:892},{width:568,height:320}])for(const scale of [1,1.35]){
  await page.setViewportSize(viewport);await seed(scale,scale===1.35?'dark':'light');await check(`${viewport.width}×${viewport.height} ${Math.round(scale*100)}%：导航、竖向日期、课程三区互不重叠`,async()=>{
   assert.equal(await strip().getAttribute('data-orientation'),'vertical');await visibleSelection();const value=await railGeometry();geometry.push({viewport,scale,...value});assert.ok(value.nav.right<=value.rail.left+1);assert.ok(value.rail.right<value.region.left);assert.ok(value.region.right<=viewport.width+1);assert.ok(value.rail.bottom<=viewport.height+1,JSON.stringify(value));assert.equal(value.overflow,false);assert.equal(await picked().getAttribute('data-date'),'2026-10-02');assert.match(await picked().getAttribute('aria-label'),/虚构休息标记/);assert.equal(await picked().locator('.holiday-mark').innerText(),'休');await page.screenshot({path:`build/evidence/${version}-date-rail-${viewport.width}x${viewport.height}-${Math.round(scale*100)}.png`});
  });
 }
 await page.setViewportSize({width:844,height:390});await seed();const baseline=await model();
 await check('竖向真实触摸上下滚动与取消不改日期、不误选、不改课表',async()=>{await swipe(-1);await swipe(1);await swipe(-1,true);assert.deepEqual(await model(),baseline);});
 await check('181项同一窗口可在竖向两端连续补充日期并保持锚点',async()=>{
  for(const edge of ['start','end']){
   const anchor=await strip().evaluate((el,edge)=>{el.scrollTop=edge==='start'?0:el.scrollHeight-el.clientHeight;const rect=el.getBoundingClientRect(),items=[...el.querySelectorAll('.date-item')],item=items.find(node=>node.getBoundingClientRect().top>=rect.top+1);return {date:item.dataset.date,offset:item.getBoundingClientRect().top-rect.top};},edge);
   await page.waitForTimeout(500);assert.equal(await strip().locator('.date-item').count(),181);const next=await strip().locator(`[data-date="${anchor.date}"]`).evaluate(el=>({offset:el.getBoundingClientRect().top-el.parentElement.getBoundingClientRect().top}));assert.ok(Math.abs(next.offset-anchor.offset)<2,JSON.stringify({edge,anchor,next}));assert.equal(await picked().getAttribute('data-date'),'2026-10-02');
  }assert.deepEqual(await model(),baseline);
 });
 await check('年月跳转与横竖屏来回调整保持同一日期和节假日语义',async()=>{
  await home().getByRole('button',{name:'选择日期',exact:true}).click();await page.getByRole('dialog',{name:'选择日期',exact:true}).getByRole('button',{name:'2026-10-03，无课程',exact:true}).click();await visibleSelection();await home().getByRole('button',{name:'选择日期',exact:true}).click();await page.getByRole('dialog',{name:'选择日期',exact:true}).getByRole('button',{name:'2026-10-02，1 门课程，休假：虚构休息标记（隔离测试日历）',exact:true}).click();await visibleSelection();
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:320,height:760},{width:1304,height:892}]){await page.setViewportSize(viewport);await visibleSelection();assert.equal(await picked().getAttribute('data-date'),'2026-10-02');assert.equal(await picked().locator('.holiday-mark').innerText(),'休');assert.equal(await strip().locator('.date-item').count(),181);}assert.deepEqual(await model(),baseline);
 });
 await check('手机仍为原横向日期条，真实左右滑动保留日期选择',async()=>{await page.setViewportSize({width:390,height:844});await visibleSelection();assert.equal(await strip().getAttribute('data-orientation'),'horizontal');await swipe(-1);await swipe(1);assert.deepEqual(await model(),baseline);});
 await check('减少动态效果下跳转即时完成，导航往返保持同一日期',async()=>{await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:844,height:390});await visibleSelection();await strip().locator('[data-date="2026-10-03"]').click();await visibleSelection();assert.equal(await picked().getAttribute('data-date'),'2026-10-03');await goTab(page,'搜索');await goTab(page,'列表');assert.equal(await picked().getAttribute('data-date'),'2026-10-03');assert.deepEqual(await model(),baseline);});
 assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-date-rail-results.json`,JSON.stringify({version,completed:true,checks,geometry,errors,scope:'隔离浏览器、虚构课程及节假日；同一日期窗口与真实Chromium touch验证'},null,2));
}finally{await browser.close();}
