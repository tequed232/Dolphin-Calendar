import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Singapore'}),page=await context.newPage(),touch=await context.newCDPSession(page);
const results=[],errors=[],samples=[];page.on('pageerror',error=>errors.push(error.message));
const home=()=>page.locator('.screen.active[data-screen=list]'),card=id=>home().locator(`.day-course[data-course-id="${id}"]`);
async function check(name,run){await run();results.push(name);console.log('PASS '+name);}
async function gesture(target,direction){
 const box=await target.boundingBox(),host=await home().boundingBox(),top=Math.max(box.y,host.y)+12,bottom=Math.min(box.y+box.height,host.y+host.height)-12,x=box.x+box.width/2;
 assert.ok(bottom-top>=40,'卡片可见触摸区域不足');const from=direction==='up'?bottom:top,to=direction==='up'?top:bottom;
 assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.day-course')?.dataset.courseId,{x,y:from}),await target.getAttribute('data-course-id'));
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
 for(let i=1;i<=12;i++){await page.waitForTimeout(20);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/12}]});}
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
}
async function stored(){return page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});}
async function seed(scale){
 await page.evaluate(async scale=>{
  const {initialData}=await import('/src/lib/model.ts'),{saveData}=await import('/src/lib/storage.ts');const data=initialData();data.onboarded=true;
  Object.assign(data.settings,{scale,mode:'dark',autoUpdate:false,timetableMode:'list',showCurrentTimeLine:false,showWeekend:true});
  data.schedule.term={name:'触摸回归合成学期',startDate:'2026-10-05',weeks:2};
  data.schedule.courses=[{id:'normal',name:'普通连堂课程',teacher:'示例教师',room:'示例教室',day:3,start:1,end:2,weeks:[1],color:'sage',notes:''},{id:'long',name:'长名称内容阅读验证'.repeat(45),teacher:'长教师名称示例'.repeat(12),room:'长地点说明示例'.repeat(12),day:3,start:3,end:4,weeks:[1],color:'blue',notes:''}];await saveData(data);
 },scale);await page.reload();await card('normal').waitFor();await page.waitForTimeout(350);
}
async function align(target){await target.evaluate(el=>{const screen=el.closest('.screen'),box=el.getBoundingClientRect(),host=screen.getBoundingClientRect();screen.scrollTop+=box.top-host.top-36;});await page.waitForTimeout(200);}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date('2026-10-07T00:00:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.locator('.load-note').waitFor({state:'hidden'});
 for(const {width,height,scale} of [{width:390,height:844,scale:1},{width:320,height:568,scale:1.1},{width:844,height:390,scale:1.1}]){
  await page.setViewportSize({width,height});await seed(scale);const original=await stored(),normal=card('normal');
  await check(`${width}×${height}、${Math.round(scale*100)}%：从普通课程卡片向上滑能滚动列表`,async()=>{
   assert.equal(await normal.evaluate(el=>el.scrollHeight>el.clientHeight),false,'合成普通卡片不应内部溢出');await align(normal);
   const before=await home().evaluate(el=>el.scrollTop);await gesture(normal,'up');const after=await home().evaluate(el=>el.scrollTop);assert.ok(after>before+15,JSON.stringify({before,after,screen:await home().evaluate(el=>({max:el.scrollHeight-el.clientHeight,top:el.scrollTop})),cards:await home().locator('.day-course').evaluateAll(els=>els.map(el=>({id:el.dataset.courseId,top:el.scrollTop,max:el.scrollHeight-el.clientHeight,y:getComputedStyle(el).overscrollBehaviorY})))}));
   assert.equal(await page.locator('.course-sheet').count(),0);assert.deepEqual(await stored(),original);samples.push({width,height,scale,type:'normal-up',before,after});
  });
  await check(`${width}×${height}：从普通课程卡片向下滑能返回上方`,async()=>{
   await align(normal);const before=await home().evaluate(el=>el.scrollTop);await gesture(normal,'down');const after=await home().evaluate(el=>el.scrollTop);assert.ok(after<before-15,JSON.stringify({before,after}));
   assert.equal(await page.locator('.course-sheet').count(),0);assert.deepEqual(await stored(),original);samples.push({width,height,scale,type:'normal-down',before,after});
  });
  const long=card('long');await align(long);await long.evaluate(el=>el.scrollTop=0);
  await check(`${width}×${height}：长课程先滚动内容，未到边界时不带动列表`,async()=>{
   assert.ok(await long.evaluate(el=>el.scrollHeight>el.clientHeight+80));const before=await home().evaluate(el=>el.scrollTop);await gesture(long,'up');
   assert.ok(await long.evaluate(el=>el.scrollTop>15));assert.equal(await home().evaluate(el=>el.scrollTop),before);assert.equal(await page.locator('.course-sheet').count(),0);assert.deepEqual(await stored(),original);
  });
  await check(`${width}×${height}：长课程滚到底后继续上滑，滚动交给列表`,async()=>{
   await align(long);await long.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(200);const before=await home().evaluate(el=>el.scrollTop);await gesture(long,'up');const after=await home().evaluate(el=>el.scrollTop);assert.ok(after>before+15,JSON.stringify({before,after,screen:await home().evaluate(el=>({max:el.scrollHeight-el.clientHeight,top:el.scrollTop})),cards:await home().locator('.day-course').evaluateAll(els=>els.map(el=>({id:el.dataset.courseId,top:el.scrollTop,max:el.scrollHeight-el.clientHeight,y:getComputedStyle(el).overscrollBehaviorY})))}));
   assert.equal(await page.locator('.course-sheet').count(),0);assert.deepEqual(await stored(),original);samples.push({width,height,scale,type:'long-bottom-chain',before,after});
  });
  await check(`${width}×${height}：长课程回到顶后继续下滑，滚动交给列表`,async()=>{
   await align(long);await long.evaluate(el=>el.scrollTop=0);await page.waitForTimeout(200);const before=await home().evaluate(el=>el.scrollTop);await gesture(long,'down');const after=await home().evaluate(el=>el.scrollTop);assert.ok(after<before-15,JSON.stringify({before,after}));assert.equal(await page.locator('.course-sheet').count(),0);assert.deepEqual(await stored(),original);
  });
  await check(`${width}×${height}：滑动结束后点按课程仍打开详情，不修改课程`,async()=>{
   await normal.tap();await page.locator('.course-sheet').waitFor();assert.match(await page.locator('.course-sheet').innerText(),/普通连堂课程/);await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();assert.deepEqual(await stored(),original);
  });
 }
 await check('两指接触并依次抬起不误切日期，取消触摸不打开详情',async()=>{
  await page.setViewportSize({width:390,height:844});await seed(1);const original=await stored(),long=card('long');await align(long);const before=await home().locator('.home-inner').getAttribute('data-focus-date'),box=await long.boundingBox(),p1={id:1,x:box.x+30,y:box.y+40},p2={id:2,x:box.x+130,y:box.y+40};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p1]});await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p1,p2]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[p1]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
  assert.equal(await home().locator('.home-inner').getAttribute('data-focus-date'),before);assert.equal(await page.locator('.course-sheet').count(),0);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p1]});await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await home().locator('.home-inner').getAttribute('data-focus-date'),before);assert.deepEqual(await stored(),original);
 });
 assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:`build/evidence/${version}-list-card-scroll-failure.png`});throw error;}
finally{await writeFile(`build/evidence/${version}-list-card-scroll-results.json`,JSON.stringify({version,results,samples,errors,completed:results.length===19},null,2));await browser.close();}
