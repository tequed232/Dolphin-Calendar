import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab,pasteJSON} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Singapore'}),touch=await page.context().newCDPSession(page),checks=[],samples=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const active=()=>page.locator('.screen.active'),grid=()=>active().locator('.week-grid-scroll');
const date=()=>active().locator('.home-inner').getAttribute('data-focus-date');
async function stored(){return page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});}
async function pass(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function select(key){await active().getByRole('button',{name:'选择日期',exact:true}).click();await page.getByRole('dialog',{name:'选择日期',exact:true}).locator(`[data-date="${key}"]`).click();await page.waitForTimeout(180);assert.equal(await date(),key);}
async function top(){await active().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(180);}
async function swipe(up){
 const box=await grid().boundingBox(),screen=await active().boundingBox(),nav=await page.locator('.primary-navigation').boundingBox();
 const bottom=Math.min(box.y+box.height,screen.y+screen.height,nav.width>nav.height?nav.y:screen.y+screen.height)-30;
 const start=up?bottom:Math.max(box.y,screen.y)+35,end=up?Math.max(start-180,screen.y+30):Math.min(start+180,bottom);
 assert.ok(Math.abs(end-start)>45,'网格可见滑动区域不足');const x=box.x+box.width*.6;
 const before=await active().evaluate(el=>el.scrollTop),left=await grid().evaluate(el=>el.scrollLeft);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
 for(let i=1;i<=12;i++){await page.waitForTimeout(22);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/12}]});}
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(280);
 const sample={up,before,after:await active().evaluate(el=>el.scrollTop),max:await active().evaluate(el=>el.scrollHeight-el.clientHeight),left,afterLeft:await grid().evaluate(el=>el.scrollLeft),date:await date()};samples.push(sample);return sample;
}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date('2026-10-07T00:00:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await active().getByRole('button',{name:'导入课表',exact:true}).click();await pasteJSON(page);
 const courses=[{name:'周一早课',day:1,start:1,end:2},{name:'周一中课',day:1,start:3,end:4},{name:'周四中课',day:4,start:5,end:6},{name:'周四晚课',day:4,start:9,end:10},{name:'周五课程',day:5,start:7,end:8}].map(course=>({...course,weeks:[1,2],teacher:'示例教师',room:'示例教室'}));
 await active().getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({term:{name:'滚动日期回归',startDate:'2026-10-05',weeks:2},courses}));await active().getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('dialog',{name:'确认这份课表',exact:true}).getByRole('button',{name:'确认导入',exact:true}).click();await goTab(page,'平铺');const original=(await stored()).schedule;
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1304,height:892}]){
  await page.setViewportSize(viewport);
  await pass(`${viewport.width}×${viewport.height}：导入后选周一，连续上滑与下滑保留日期、整周和课程数据`,async()=>{
   await top();await select('2026-10-05');const week=await active().locator('.grid-day').evaluateAll(els=>els.map(el=>el.dataset.focusDate));
   for(let i=0;i<4;i++){const sample=await swipe(true);assert.ok(sample.after>sample.before+10||sample.after>=sample.max-2,JSON.stringify(sample));assert.equal(sample.afterLeft,sample.left);assert.equal(sample.date,'2026-10-05',JSON.stringify(samples));}
   for(let i=0;i<2;i++){const sample=await swipe(false);assert.ok(sample.after<sample.before-10,JSON.stringify(sample));assert.equal(sample.date,'2026-10-05');}
   assert.deepEqual(await active().locator('.grid-day').evaluateAll(els=>els.map(el=>el.dataset.focusDate)),week);assert.deepEqual((await stored()).schedule,original);assert.equal(await page.locator('.course-sheet,.resize-handle').count(),0);
  });
  await pass(`${viewport.width}×${viewport.height}：选无课日期/周日后纵向滚动，切列表仍保留选择`,async()=>{
   await top();await select('2026-10-11');for(let i=0;i<2;i++){await swipe(true);assert.equal(await date(),'2026-10-11');}await goTab(page,'列表');assert.equal(await date(),'2026-10-11');await goTab(page,'平铺');assert.equal(await date(),'2026-10-11');assert.deepEqual((await stored()).schedule,original);
  });
 }
 await pass('横向平移仍映射可视日期；再明确选日期后纵向滚动不会覆盖',async()=>{
  await page.setViewportSize({width:320,height:568});await top();await select('2026-10-05');await swipe(true);await grid().evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(220);assert.notEqual(await date(),'2026-10-05');await top();await select('2026-10-09');await swipe(true);assert.equal(await date(),'2026-10-09');assert.deepEqual((await stored()).schedule,original);
 });
 await pass('空白整周的纵向滚动不误当横向平移，不选中居中的星期四',async()=>{
  await top();await select('2026-10-18');for(let i=0;i<3;i++){await swipe(true);assert.equal(await date(),'2026-10-18');}assert.deepEqual((await stored()).schedule,original);
 });
 await pass('内层scroll事件没有水平位移时也保留空白日期',async()=>{
  const left=await grid().evaluate(el=>el.scrollLeft);await grid().evaluate(el=>el.dispatchEvent(new Event('scroll')));await page.waitForTimeout(100);assert.equal(await grid().evaluate(el=>el.scrollLeft),left);assert.equal(await date(),'2026-10-18');
 });
 await pass('点按另一日课程仍选择该课程日期，离开卡片继续纵向滚动也保留该日',async()=>{
  await page.setViewportSize({width:1304,height:892});await top();await select('2026-10-05');const card=active().locator('.grid-course').filter({hasText:'周四中课'});await card.scrollIntoViewIfNeeded();await card.locator('.grid-course-content').tap();await page.locator('.course-sheet').waitFor();assert.equal(await date(),'2026-10-08');await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();await swipe(true);await swipe(false);assert.equal(await date(),'2026-10-08');assert.deepEqual((await stored()).schedule,original);
 });
 assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:`build/evidence/${version}-grid-scroll-date-failure.png`});throw error;}
finally{await writeFile(`build/evidence/${version}-grid-scroll-date-results.json`,JSON.stringify({version,checks,samples,errors,completed:checks.length===12},null,2));await browser.close();}
