/** Browser-only synthetic fixture: course palette, hierarchy and unchanged layout actions. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const output='build/evidence',checks=[],samples=[],errors=[];
await mkdir(output,{recursive:true});
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}});
page.on('pageerror',error=>errors.push(error.message));
const palette=['sage','lavender','peach','blue','rose'];
const cases=[
 {id:'light-portrait',mode:'light'},
 {id:'dark-portrait',mode:'dark'},
 {id:'system-dark-portrait',mode:'system',scheme:'dark'},
 {id:'light-landscape-135',mode:'light',landscape:true,scale:1.35},
 {id:'dark-landscape-135',mode:'dark',landscape:true,scale:1.35},
 {id:'system-dark-landscape-135',mode:'system',scheme:'dark',landscape:true,scale:1.35},
 {id:'dynamic-light-portrait-135',mode:'light',dynamic:true,scale:1.35},
 {id:'dynamic-dark-landscape-135',mode:'dark',dynamic:true,landscape:true,scale:1.35},
 {id:'dynamic-system-dark-portrait-135',mode:'system',scheme:'dark',dynamic:true,scale:1.35},
 {id:'reduced-motion-dark-portrait-135',mode:'dark',motion:'reduce',scale:1.35}
];
let userBackground,base,report={version,scope:'Isolated browser fixture only; no real device, user data, or production settings changed',checks,samples,status:'running'};
async function stored(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}});}
async function seed(value){await page.evaluate(async value=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'app');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},value);await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await page.locator('.tab-screen.active').waitFor();}
function rgb(value){const numbers=value.match(/[\d.]+/g).map(Number);return numbers.slice(0,3);}
function contrast(a,b){const luminance=values=>values.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function check(name,action){await action();checks.push(name);console.log('PASS '+name);}
async function screenshot(name){await page.mouse.move(1,1);await page.screenshot({path:`${output}/${version}-course-theme-${name}.png`});}
async function cards(selector){return page.locator(selector).evaluateAll(elements=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');const rgb=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);const bytes=context.getImageData(0,0,1,1).data;return `rgb(${bytes[0]}, ${bytes[1]}, ${bytes[2]})`;};return elements.map(el=>{const style=getComputedStyle(el),title=el.querySelector('h3,strong'),meta=el.querySelector('.course-meta,.grid-course-room');return {color:el.dataset.courseId?.replace('theme-',''),background:rgb(style.backgroundColor),text:rgb(getComputedStyle(title).color),secondary:rgb(getComputedStyle(meta).color),filter:style.filter,radius:style.borderRadius};});});}
async function courseState(){return (await stored()).schedule.courses;}
async function waitEnd(end){for(let i=0;i<25;i++){if((await courseState()).find(c=>c.id==='theme-sage').end===end)return;await page.waitForTimeout(80);}throw Error('Resize action did not persist the expected course span');}
try{
 await page.clock.setFixedTime(new Date(2026,9,7,9));
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
 await page.getByRole('button',{name:'先逛一逛',exact:true}).click();base=await stored();
 userBackground=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d');context.fillStyle='#70818e';context.fillRect(0,0,32,32);context.fillStyle='#b9c8bf';context.fillRect(0,0,16,32);return canvas.toDataURL('image/png');});
 const courses=palette.map((color,index)=>({id:`theme-${color}`,name:`课程${index+1} · 低饱和配色`,teacher:`教师${index+1}`,room:`${index+1}栋20${index+1}号教室`,day:3,start:index*2+1,end:index*2+2,weeks:[1],color,notes:'课程备注\n保留原始功能与数据。'}));
 for(const sample of cases){
  await page.setViewportSize(sample.landscape?{width:920,height:420}:{width:390,height:844});
  await page.emulateMedia({colorScheme:sample.scheme??'light',reducedMotion:sample.motion??'no-preference'});
  const fixture={...base,onboarded:true,schedule:{...base.schedule,term:{name:'主题验证学期',startDate:'2026-10-05',weeks:20},courses},settings:{...base.settings,timetableMode:'list',mode:sample.mode,scale:sample.scale??1,dynamicColor:!!sample.dynamic,backgroundEnabled:true,backgroundBlur:17,glassMode:'partial'},background:{url:userBackground,name:'用户背景测试',width:32,height:32,sourceWidth:32,sourceHeight:32}};
  await seed(fixture);await page.evaluate(()=>document.documentElement.style.setProperty('--system-primary','#8fcab1'));await page.waitForTimeout(100);
  const result={id:sample.id,mode:sample.mode,scale:sample.scale??1};samples.push(result);
  await check(`${sample.id}: list palette, text contrast and saved background`,async()=>{
   result.list=await cards('.timetable .course-card[data-course-id]');assert.equal(result.list.length,5);
   for(const card of result.list){assert.ok(contrast(card.background,card.text)>=4.5,`${card.color} title contrast`);assert.ok(contrast(card.background,card.secondary)>=4.5,`${card.color} secondary contrast`);}
   const photo=await page.locator('.background-photo').evaluate(el=>({image:getComputedStyle(el).backgroundImage,filter:getComputedStyle(el).filter,source:el.parentElement.dataset.source}));assert.equal(photo.source,'custom');assert.ok(photo.image.includes(userBackground));assert.equal(photo.filter,'blur(17px)');result.background=photo;
   assert.deepEqual(await courseState(),courses);
   if(sample.dynamic)assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),'#8fcab1');
   await screenshot(`${sample.id}-list`);
  });
  await goTab(page,'平铺');await page.locator('.grid-course').first().waitFor();await page.waitForTimeout(100);
  await check(`${sample.id}: matching grid palette, quiet empty cells and selected day`,async()=>{
   result.grid=await cards('.grid-course');assert.equal(result.grid.length,5);
   for(const card of result.grid){const list=result.list.find(v=>v.color===card.color);assert.equal(card.background,list.background);assert.equal(card.text,list.text);assert.equal(card.radius,list.radius);assert.equal(card.filter,'none');assert.ok(contrast(card.background,card.secondary)>=4.5);}
   assert.equal(await page.locator('.grid-day').count(),7);assert.equal(await page.locator('.grid-period').count(),12);
   const empty=await page.locator('.grid-empty').first().evaluate(el=>({border:getComputedStyle(el).borderWidth,radius:getComputedStyle(el).borderRadius}));assert.equal(empty.border,'0px');assert.equal(empty.radius,result.grid[0].radius);
   const screen=await page.locator('.tab-screen.active').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(screen.scroll<=screen.width+1);
   if(sample.dynamic)assert.equal(await page.locator('.grid-day.selected strong').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(143, 202, 177)');
   if(sample.motion==='reduce')assert.ok(await page.locator('.grid-course').first().evaluate(el=>getComputedStyle(el).transitionDuration.split(',').every(value=>parseFloat(value)<=.00001)),'Reduced motion has no perceptible course transition');
   if(sample.mode==='system'){const before=await cards('.grid-course');await page.evaluate(()=>document.documentElement.dataset.mode='system');assert.deepEqual(await cards('.grid-course'),before,'CSS system-dark branch shares the exact palette');await page.evaluate(()=>document.documentElement.dataset.mode='dark');}
   await page.locator('.tab-screen.active').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(80);await screenshot(`${sample.id}-grid`);
  });
  await check(`${sample.id}: selected handles, keyboard resize, completion and details`,async()=>{
   const first=page.locator('.grid-course[data-course-id=theme-sage]');await first.getByRole('button',{name:/调整布局$/}).click({force:true});await first.getByRole('button',{name:/结束节次拖动$/}).waitFor();
   const selected=await first.evaluate(el=>({outline:parseFloat(getComputedStyle(el).outlineWidth),color:getComputedStyle(el).outlineColor,handles:el.querySelectorAll('.resize-handle').length}));assert.equal(selected.handles,2);assert.ok(Math.abs(selected.outline*(sample.scale??1)-2)<.1,'Selected outline stays two physical CSS pixels under UI zoom');
   if(sample.id==='dark-portrait'||sample.id==='dark-landscape-135')await screenshot(`${sample.id}-grid-selected`);
   const handle=first.getByRole('button',{name:/结束节次拖动$/});await handle.focus();await handle.press('ArrowUp');await waitEnd(1);await handle.press('ArrowDown');await waitEnd(2);
   await page.locator('.layout-status').getByRole('button',{name:'完成',exact:true}).click();assert.equal(await page.locator('.resize-handle').count(),0);assert.deepEqual(await courseState(),courses);
   await first.locator('.grid-course-content').click();const detail=page.getByRole('dialog',{name:`${courses[0].name}详情`,exact:true});await detail.waitFor();
   assert.equal(await detail.locator('h1').innerText(),courses[0].name);assert.ok(await detail.getByRole('button',{name:/导航至/}).count());assert.ok(await detail.getByRole('button',{name:'手动填写教材',exact:true}).count());
   const size=await detail.locator('.sheet-body').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client+1);
   if(sample.id==='dark-portrait'||sample.id==='dark-landscape-135')await screenshot(`${sample.id}-detail-top`);
   await detail.getByRole('button',{name:'编辑这门课程',exact:true}).scrollIntoViewIfNeeded();await screenshot(`${sample.id}-detail`);
   await detail.getByRole('button',{name:'关闭课程详情',exact:true}).click();assert.deepEqual(await courseState(),courses);
  });
 }
 await page.setViewportSize({width:920,height:640});await page.emulateMedia({colorScheme:'dark',reducedMotion:'no-preference'});
 await seed({...base,onboarded:true,schedule:{...base.schedule,term:{name:'拖动验证学期',startDate:'2026-10-05',weeks:20},courses},settings:{...base.settings,timetableMode:'grid',mode:'dark',scale:1.35}});
 await goTab(page,'平铺');
 await check('135% dark: actual drag feedback, day move and restore preserve original courses',async()=>{
  const first=page.locator('.grid-course[data-course-id=theme-sage]');await first.getByRole('button',{name:/调整布局$/}).click({force:true});
  const columns=await page.locator('.grid-day').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().x)),step=columns[1]-columns[0];
  for(const delta of [1,-1]){
   const before=await courseState();
   const content=first.locator('.grid-course-content');await content.scrollIntoViewIfNeeded();const box=await content.boundingBox(),x=box.x+box.width/2,y=box.y+Math.min(30,box.height/2);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta*step,y,{steps:8});await page.locator('.grid-course.resizing').waitFor();
   assert.ok(await first.locator('.resize-value').innerText());assert.deepEqual(await courseState(),before,'Dragging shows a preview before pointer release');
   if(delta===1)await page.screenshot({path:`${output}/${version}-course-theme-dark-landscape-135-grid-drag.png`});
   await page.mouse.up();for(let i=0;i<25&&(await courseState()).find(c=>c.id==='theme-sage').day!==(delta===1?4:3);i++)await page.waitForTimeout(80);
   assert.equal((await courseState()).find(c=>c.id==='theme-sage').day,delta===1?4:3);
  }
  await page.locator('.layout-status').getByRole('button',{name:'完成',exact:true}).click();assert.deepEqual(await courseState(),courses);
 });
 await check('135% dark: resize conflict remains guarded and cancellation leaves courses unchanged',async()=>{
  const first=page.locator('.grid-course[data-course-id=theme-sage]');await first.getByRole('button',{name:/调整布局$/}).click({force:true});const handle=first.getByRole('button',{name:/结束节次拖动$/});await handle.focus();await handle.press('ArrowDown');
  const conflict=page.getByRole('dialog',{name:'课程时间冲突',exact:true});await conflict.waitFor();assert.match(await conflict.innerText(),/课程2/);assert.deepEqual(await courseState(),courses);await conflict.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await courseState(),courses);
 });
 assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;await screenshot('failure').catch(()=>{});throw error;}
finally{report.completedAt=new Date().toISOString();await writeFile(`${output}/${version}-course-theme-results.json`,JSON.stringify(report,null,2));await browser.close();}
