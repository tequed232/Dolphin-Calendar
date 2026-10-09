import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {goTab,pasteJSON} from './check-navigation.mjs';
import {launchBrowser} from './check-browser.mjs';
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',hasTouch:true}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{window.nativeMessages=[];window.mockDolphin={postMessage(raw){window.nativeMessages.push(JSON.parse(raw));}};window.Dolphin=window.mockDolphin;});
// Keep timers and animation frames real while fixing only the wall clock. This
// avoids an Edge/Playwright all-frame clock update hanging after repeated reloads.
await page.addInitScript(()=>{
 const NativeDate=Date;window.__homeCheckTime=Number(sessionStorage.getItem('__homeCheckTime'))||Date.parse('2026-10-07T06:05:00Z');
 window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__homeCheckTime]));}static now(){return window.__homeCheckTime;}};
});
async function clock(time){await page.evaluate(time=>{window.__homeCheckTime=time;sessionStorage.setItem('__homeCheckTime',String(time));},Date.parse(time));}
const active=()=>page.locator('.screen.active');
const pass=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
async function state(){return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);r.result.close();};};}));}
async function seed(mode='list',legacy=false){
 await page.evaluate(async({mode,legacy})=>{
  const {initialData}=await import('/src/lib/model.ts'),{resizePeriods}=await import('/src/lib/scheduleTime.ts');const data=initialData();data.onboarded=true;data.settings={...data.settings,mode:'light',autoUpdate:false,timetableMode:mode};
  data.schedule.term={name:'交互验收',startDate:'2026-10-05',weeks:20};data.schedule.periods=resizePeriods(data.schedule.periods,14);
  const course=(id,name,day,start,end)=>({id,name,day,start,end,weeks:[1,2,3],color:'sage',room:'16栋203号教室',teacher:'陈老师',notes:''});
  data.schedule.courses=[course('wed-early','周三早课',3,1,2),course('wed-focus','周三数学',3,5,6),course('wed-late','周三晚课',3,11,12),course('fri-focus','周五英语',5,5,6),course('fri-late','周五晚课',5,11,12),{...course('temporary','临时自习',3,8,8),temporary:true,specificDate:'2026-10-07'}];
  if(legacy){data.schedule.courses=[{...course('legacy','旧课表数学',3,5,6),start:undefined,end:undefined,startSection:5,endSection:6}];delete data.settings.timetableMode;delete data.settings.showTimes;}
  const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');tx.oncomplete=resolve;});db.close();
 },{mode,legacy});
 await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await active().locator('.home-controls').waitFor();await page.waitForTimeout(150);
}
async function home(){const mode=(await state()).settings.timetableMode;await goTab(page,mode==='grid'?'平铺':'列表');await page.locator('.screen.active[data-screen=list],.screen.active[data-screen=grid]').waitFor();}
async function manage(){await home();await active().getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('[data-screen=editor].active').waitFor();}
async function switchMode(value){await goTab(page,value);await page.waitForFunction(value=>document.querySelector('.primary-navigation button[aria-current=page]')?.textContent===value,value);await page.waitForTimeout(80);}
async function reveal(id){await page.locator('.screen.active [data-course-id="'+id+'"]').evaluate(el=>{const screen=el.closest('.screen'),bounds=screen.getBoundingClientRect(),r=el.getBoundingClientRect(),top=bounds.top+parseFloat(getComputedStyle(screen).paddingTop)+12,bottom=bounds.bottom-18,anchor=top+(bottom-top)*.38;screen.scrollTop+=r.top+Math.min(r.height/2,80)-anchor;});await page.waitForTimeout(100);}
async function comfortable(id){const r=await page.locator('.screen.active [data-course-id="'+id+'"]').evaluate(el=>{const r=el.getBoundingClientRect(),screen=el.closest('.screen'),bounds=screen.getBoundingClientRect(),head=screen.querySelector('.home-controls').getBoundingClientRect();return {point:r.top+Math.min(r.height/2,80),header:Math.max(bounds.top+parseFloat(getComputedStyle(screen).paddingTop),head.bottom),bottom:bounds.bottom};});assert.ok(r.point>r.header+8&&r.point<r.bottom-30,JSON.stringify(r));}
async function enter(name){const button=page.getByRole('button',{name:name+'调整布局',exact:true});await button.evaluate(el=>el.style.opacity='1');await button.click();await page.locator('.week-grid[data-layout-editing=true]').waitFor();}
async function showToolbar(){await active().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(150);}
async function closeDetail(){await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();}
async function dragHandle(name,edge,delta){const button=page.getByRole('button',{name:`${name}${edge}节次拖动`,exact:true}),box=await button.boundingBox(),course=(await state()).schedule.courses.find(c=>c.name===name),original=edge==='开始'?course.start:course.end,target=Math.max(1,Math.min(14,original+delta)),points=await page.locator('.grid-period').evaluateAll((rows,edge)=>rows.map(row=>{const r=row.getBoundingClientRect();return edge==='开始'?r.top:r.bottom-Number(row.dataset.breakHeight)*(r.height/parseFloat(getComputedStyle(row).height));}),edge),dy=points[target-1]-points[original-1];await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+dy,{steps:8});await page.mouse.up();await page.waitForTimeout(180);}

try{
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await clock('2026-10-07T06:05:00Z');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await seed();
 await pass('列表日期条切换有课/无课日期，逐帧保持顶部和日期栏，不闪到下方课程',async()=>{
  for(const date of ['2026-10-09','2026-10-08','2026-10-07']){
   await active().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(100);
   await page.evaluate(()=>{window.dateScrollFrames=[];window.recordDateScroll=true;const frame=()=>{if(!window.recordDateScroll)return;window.dateScrollFrames.push(document.querySelector('.screen.active').scrollTop);requestAnimationFrame(frame);};requestAnimationFrame(frame);});
   await active().locator(`.date-item[data-date="${date}"]`).click();await page.waitForTimeout(400);
   const frames=await page.evaluate(()=>{window.recordDateScroll=false;return window.dateScrollFrames;});
   assert.ok(frames.length>3);assert.ok(frames.every(top=>Math.abs(top)<1),JSON.stringify({date,frames}));
   assert.equal(await active().locator('.date-item.selected').getAttribute('data-date'),date);
  }
 });
 await pass('列表月历选日期和跨周导航保持当前位置，日期选择不重复执行默认定位',async()=>{
  await active().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(100);
  await active().getByRole('button',{name:'选择日期',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择日期',exact:true});await picker.waitFor();
  await page.evaluate(()=>{window.dateScrollFrames=[];window.recordDateScroll=true;const frame=()=>{if(!window.recordDateScroll)return;window.dateScrollFrames.push(document.querySelector('.screen.active').scrollTop);requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await picker.locator('[data-date="2026-10-09"]').click();await page.waitForTimeout(400);
  const frames=await page.evaluate(()=>{window.recordDateScroll=false;return window.dateScrollFrames;});assert.ok(frames.every(top=>Math.abs(top)<1),JSON.stringify(frames));
  await active().getByRole('button',{name:'下一周',exact:true}).click();await page.waitForTimeout(120);assert.equal(await active().evaluate(el=>el.scrollTop),0);assert.equal(await active().locator('.home-inner').getAttribute('data-focus-date'),'2026-10-16');
  await active().getByRole('button',{name:'上一周',exact:true}).click();await page.waitForTimeout(120);assert.equal(await active().evaluate(el=>el.scrollTop),0);
  await seed();
 });
 await pass('列表课程所有文字禁止选择，长按不产生选区，正常点击仍查看详情',async()=>{
  await reveal('wed-focus');const card=active().locator('[data-course-id=wed-focus]');
  assert.equal(await card.evaluate(el=>[el,...el.querySelectorAll('*')].every(node=>getComputedStyle(node).userSelect==='none')),true);
  const name=card.locator('h3'),box=await name.boundingBox();await page.mouse.move(box.x+20,box.y+10);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.move(box.x+box.width-10,box.y+10,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');
  if(await page.locator('.course-sheet').count())await closeDetail();
  await name.click();await page.locator('.course-sheet').waitFor();await closeDetail();
 });
 await pass('设置只管理应用，主页课表管理集中配置/课程/导入导出',async()=>{
  await goTab(page,'设置');assert.deepEqual(await active().locator('.setting-entry strong').allTextContents(),['主页显示','课表管理','外观','实时通知','导航与学校','应用更新','数据与备份','关于']);assert.equal(await active().getByText('开学日期',{exact:true}).count(),0);await manage();assert.equal(await active().getByRole('button',{name:/数据与备份/}).count(),1);assert.equal(await active().getByRole('button',{name:/开学日期与课程节数/}).count(),1);await home();
 });
 await pass('四栏Dock独立路由及顺序正确，顶部不再重复切换；导入任务隐藏Dock',async()=>{
  assert.deepEqual(await page.locator('.primary-navigation>button').allTextContents(),['列表','平铺','搜索','设置']);assert.equal(await page.locator('.view-switch').count(),0);await switchMode('平铺');assert.equal(await active().getAttribute('data-screen'),'grid');await switchMode('列表');assert.equal(await active().getAttribute('data-screen'),'list');await active().getByRole('button',{name:'导入课表',exact:true}).click();assert.equal(await page.locator('.primary-navigation').count(),0);assert.match(await active().innerText(),/JSON · CSV · Excel/);assert.match(await active().locator('input[type=file]').getAttribute('accept'),/\.json.*\.csv.*\.xlsx/);assert.equal(await active().getByRole('button',{name:'导入格式',exact:true}).count(),0);assert.equal(await active().locator('.import-steps [aria-current=step]').innerText(),'1\n选择文件\n进行中');await home();await manage();await active().locator('.import-entry').click();assert.equal(await page.locator('.primary-navigation').count(),0);await home();
 });
 await pass('JSON 配置确认后日期/12节/时间同步到管理、网格和临时课程选择器',async()=>{
  await active().getByRole('button',{name:'导入课表',exact:true}).click();const data={term:{startDate:'2026-09-07',weeks:20},courseCount:12,firstStart:'08:20',duration:45,breakMinutes:10,courses:[{name:'导入数学',day:3,start:5,end:6,weeks:[5]}]};await pasteJSON(page);await active().getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(data));await active().getByRole('button',{name:'解析并预览',exact:true}).click();const preview=page.getByRole('dialog',{name:'确认这份课表'});assert.match(await preview.innerText(),/12 节/);await preview.getByText('上课时间（12 节）',{exact:true}).click();assert.match(await preview.innerText(),/08:20–09:05/);await preview.getByRole('button',{name:'确认导入',exact:true}).click();await page.locator('.screen.active[data-screen=list],.screen.active[data-screen=grid]').waitFor();await manage();await active().getByRole('button',{name:/开学日期与课程节数/}).click();assert.equal(await page.getByRole('button',{name:'开学日期',exact:true}).innerText(),'2026/09/07');assert.equal(await page.getByLabel('课程节数',{exact:true}).inputValue(),'12');await home();await switchMode('平铺');assert.equal(await page.locator('.grid-period').count(),12);await active().getByRole('button',{name:'添加临时课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'添加临时课程'});assert.equal(await editor.getByLabel('教室',{exact:true}).isVisible(),true);assert.equal(await editor.getByRole('button',{name:'持续节数',exact:true}).count(),1);await editor.getByRole('button',{name:'取消',exact:true}).click();
 });
 await pass('CSV 说明与Parser字段同源，真实下载模板可解析并得到示例课程',async()=>{
  await home();await active().getByRole('button',{name:'导入课表',exact:true}).click();await active().locator('.import-format-help').evaluate(el=>el.open=true);await active().getByRole('button',{name:'查看格式说明',exact:true}).click();const help=page.getByRole('dialog',{name:'CSV 格式说明'});assert.match(await help.innerText(),/开学日期/);assert.match(await help.innerText(),/1-16单/);await help.getByRole('button',{name:'知道了',exact:true}).click();await page.evaluate(()=>delete window.Dolphin);const downloadPromise=page.waitForEvent('download');await active().getByRole('button',{name:'CSV 示例模板',exact:true}).click();const download=await downloadPromise,text=await readFile(await download.path(),'utf8');await page.evaluate(()=>window.Dolphin=window.mockDolphin);const parsed=await page.evaluate(async text=>{const {csvRows,parseSheet}=await import('/src/lib/fileImport.ts'),{initialData}=await import('/src/lib/model.ts');return parseSheet({name:'模板',rows:csvRows(text),merges:[]},initialData().schedule);},text);assert.equal(parsed.blocks,2);assert.equal(parsed.schedule.courses[0].name,'高等数学');assert.equal(parsed.schedule.courses[0].day,3);assert.equal(parsed.schedule.courses[0].start,5);assert.equal(parsed.schedule.courses[0].end,6);await active().locator('input[type=file]').setInputFiles({name:'template.csv',mimeType:'text/csv',buffer:Buffer.from(text)});await page.getByRole('dialog',{name:'确认这份课表',exact:true}).waitFor();await page.getByRole('button',{name:'返回修改',exact:true}).click();await home();
 });
 await pass('Excel自动识别后读取文件，损坏文件具体报错且原数据保留',async()=>{
  const before=(await state()).schedule;await active().getByRole('button',{name:'导入课表',exact:true}).click();assert.match(await active().locator('input[type=file]').getAttribute('accept'),/\.xls/);await active().locator('input[type=file]').setInputFiles({name:'bad.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/无法解析该 Excel 文件/);await page.getByRole('dialog',{name:'读取课表'}).getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual((await state()).schedule,before);await home();
 });
 await seed('grid');
 await pass('平铺默认无Handle，普通点击和微小移动只查看课程，不改变课表',async()=>{
  assert.equal(await page.locator('.resize-handle').count(),0);assert.equal(await page.locator('.grid-day').evaluateAll(days=>days.every(day=>{const box=day.getBoundingClientRect();return [...day.children].every(child=>{const r=child.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1&&r.left>=box.left-1&&r.right<=box.right+1;});})),true);const before=(await state()).schedule;await reveal('wed-focus');const box=await page.locator('.screen.active [data-course-id=wed-focus] .grid-course-content').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+35);await page.mouse.down();await page.mouse.move(box.x+box.width/2+3,box.y+37);await page.mouse.up();await page.locator('.course-sheet').waitFor();assert.equal(await page.getByRole('heading',{name:'周三数学',exact:true}).count(),1);await closeDetail();assert.deepEqual((await state()).schedule,before);
 });
 await pass('长按进入布局编辑，只当前课程显示上下两个Handle',async()=>{
  await reveal('wed-focus');const box=await page.locator('.screen.active [data-course-id=wed-focus] .grid-course-content').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+35);await page.mouse.down();await page.waitForTimeout(560);await page.mouse.up();assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');assert.equal(await page.locator('.screen.active [data-course-id=wed-focus]').evaluate(el=>[el,...el.querySelectorAll('*')].every(node=>getComputedStyle(node).userSelect==='none')),true);await page.locator('.week-grid[data-layout-editing=true]').waitFor();assert.equal(await page.locator('.resize-handle').count(),2);assert.equal(await page.locator('.screen.active [data-course-id=wed-focus] .resize-handle').count(),2);assert.equal(await page.locator('.course-sheet').count(),0);
 });
 await pass('真实触摸事件长按可进入、Handle可Resize，浏览滑动不改课程',async()=>{
  await page.getByRole('button',{name:'周四第5节添加临时课程',exact:true}).click();await reveal('wed-focus');
  const touch=await page.context().newCDPSession(page);let box=await page.locator('.screen.active [data-course-id=wed-focus] .grid-course-content').boundingBox();
  const point={x:box.x+box.width/2,y:box.y+35};await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(560);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);assert.equal(await page.locator('.resize-handle').count(),2);assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');
  box=await page.getByRole('button',{name:'周三数学结束节次拖动',exact:true}).boundingBox();const start={x:box.x+box.width/2,y:box.y+box.height/2};await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let i=1;i<=8;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x,y:start.y+i*9.5}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);assert.equal((await state()).schedule.courses.find(c=>c.id==='wed-focus').end,7);
  await page.getByRole('button',{name:'周四第5节添加临时课程',exact:true}).click();const before=(await state()).schedule;await reveal('wed-focus');box=await page.locator('.screen.active [data-course-id=wed-focus] .grid-course-content').boundingBox();const p={x:box.x+box.width/2,y:box.y+45};await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});for(let i=1;i<=8;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-i*8}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(600);assert.equal(await page.locator('.resize-handle').count(),0);assert.deepEqual((await state()).schedule,before);await touch.detach();await seed('grid');await reveal('wed-focus');await enter('周三数学');
 });
 await pass('真实触摸长按后不松手拖动课程主体，文本不选中且位置可保存',async()=>{
  await showToolbar();await active().getByRole('button',{name:'完成',exact:true}).click();await reveal('wed-focus');
  const touch=await page.context().newCDPSession(page),box=await active().locator('[data-course-id=wed-focus] .grid-course-content').boundingBox();
  const delta=await active().locator('.grid-period').evaluateAll(rows=>rows[5].getBoundingClientRect().top-rows[4].getBoundingClientRect().top),point={x:box.x+box.width/2,y:box.y+35};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(560);
  assert.equal(await active().locator('.resize-handle').count(),2);
  for(let i=1;i<=8;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+delta*i/8}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');assert.equal((await state()).schedule.courses.find(c=>c.id==='wed-focus').start,6);
  await touch.detach();await seed('grid');await reveal('wed-focus');await enter('周三数学');
 });
 await pass('点击空白立即退出编辑，第一次不打开创建弹窗',async()=>{
  await page.getByRole('button',{name:'周四第5节添加临时课程',exact:true}).click();assert.equal(await page.locator('.resize-handle').count(),0);assert.equal(await page.getByRole('dialog',{name:'添加临时课程'}).count(),0);
 });
 await pass('Android普通及预测返回优先结束编辑，取消预测返回仍保持编辑',async()=>{
  await enter('周三数学');const before=await page.evaluate(()=>window.nativeMessages.filter(m=>m.type==='exit').length);await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('cancel');});assert.equal(await page.locator('.resize-handle').count(),2);await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('commit');});await page.waitForTimeout(80);assert.equal(await page.locator('.resize-handle').count(),0);assert.equal(await page.evaluate(()=>window.nativeMessages.filter(m=>m.type==='exit').length),before);await enter('周三数学');await page.evaluate(()=>window.dolphinBack('back'));assert.equal(await page.locator('.resize-handle').count(),0);
 });
 await pass('长按计时尚未完成时切页，取消待进入手势，不在隐藏页进入编辑',async()=>{
  await reveal('wed-focus');const box=await page.locator('.screen.active [data-course-id=wed-focus] .grid-course-content').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+35);await page.mouse.down();await page.evaluate(()=>document.querySelectorAll('.primary-navigation>button')[2].click());await page.waitForTimeout(650);await page.mouse.up();assert.equal(await page.locator('.resize-handle').count(),0);await home();assert.equal(await page.locator('.week-grid').getAttribute('data-layout-editing'),'false');
 });
 await pass('Resize保存合法节次、上下边界至少1节、取消冲突不覆盖',async()=>{
  await reveal('temporary');await enter('临时自习');await dragHandle('临时自习','结束',1);assert.equal((await state()).schedule.courses.find(c=>c.id==='temporary').end,9);await dragHandle('临时自习','开始',50);const c=(await state()).schedule.courses.find(c=>c.id==='temporary');assert.equal(c.start,9);assert.equal(c.end,9);await dragHandle('临时自习','结束',30);const conflict=page.getByRole('dialog',{name:'课程时间冲突'});await conflict.waitFor();await conflict.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await state()).schedule.courses.find(c=>c.id==='temporary').end,9);
 });
 await pass('课程主体可跨星期和节次拖动，指定日期同步；切页和打开其他课程退出编辑',async()=>{
  await seed('grid');await reveal('temporary');await enter('临时自习');const box=await page.locator('.screen.active [data-course-id=temporary] .grid-course-content').boundingBox(),a=await page.locator('.grid-day').nth(2).boundingBox(),b=await page.locator('.grid-day').nth(3).boundingBox(),r1=await page.locator('.grid-period[data-period="1"]').boundingBox(),r2=await page.locator('.grid-period[data-period="2"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+35);await page.mouse.down();await page.mouse.move(box.x+box.width/2+(b.x-a.x)*2,box.y+35+(r2.y-r1.y),{steps:10});await page.mouse.up();await page.waitForTimeout(180);const c=(await state()).schedule.courses.find(c=>c.id==='temporary');assert.equal(c.day,5);assert.equal(c.start,9);assert.equal(c.specificDate,'2026-10-09');await goTab(page,'搜索');await home();assert.equal(await page.locator('.resize-handle').count(),0);await reveal('fri-focus');await enter('周五英语');await page.locator('.screen.active [data-course-id=fri-focus] .grid-course-content').click();await page.locator('.course-sheet').waitFor();assert.equal(await page.locator('.resize-handle').count(),0);await closeDetail();
 });
 await pass('列表滚到周三5–6节后切平铺，日期和可视课程连续且位于舒适区域',async()=>{
  await seed('list');await reveal('wed-focus');await switchMode('平铺');assert.equal(await active().locator('.home-inner').getAttribute('data-focus-date'),'2026-10-07');await comfortable('wed-focus');
 });
 await pass('平铺查看周五课程切列表，保留周五和同一课程，不跳周一',async()=>{
  await reveal('fri-focus');await page.locator('.screen.active [data-course-id=fri-focus] .grid-course-content').click();await closeDetail();await switchMode('列表');assert.equal(await active().locator('.home-inner').getAttribute('data-focus-date'),'2026-10-09');await comfortable('fri-focus');
 });
 await pass('已选课程优先于主要可视课程，未选择时以节次映射',async()=>{
  await seed('grid');await reveal('wed-late');await page.locator('.screen.active [data-course-id=wed-late] .grid-course-content').click();await closeDetail();await switchMode('列表');await comfortable('wed-late');await page.locator('.period-row[data-focus-section="10"]').evaluate(el=>{const screen=el.closest('.screen'),head=screen.querySelector('.home-controls').getBoundingClientRect();screen.scrollTop+=el.getBoundingClientRect().top-head.bottom-130;});await page.waitForTimeout(100);const section=Number(await active().locator('.home-inner').getAttribute('data-focus-section'));await switchMode('平铺');assert.ok(Math.abs(Number(await active().locator('.home-inner').getAttribute('data-focus-section'))-section)<=1);
 });
 await pass('首次定位今天当前课程；主动浏览后时间更新不强制拉回',async()=>{
  await seed('list');await comfortable('wed-focus');await reveal('wed-late');const before=await active().evaluate(el=>({scroll:el.scrollTop,courseTop:el.querySelector('[data-course-id=wed-late]').getBoundingClientRect().top,summary:el.querySelector('.next-course')?.outerHTML,summaryHeight:el.querySelector('.next-course')?.getBoundingClientRect().height}));await clock('2026-10-07T07:00:00Z');
  // Exercise the actual 30-second update callback without replaying animations.
  await page.waitForTimeout(31_100);const after=await active().evaluate(el=>({scroll:el.scrollTop,courseTop:el.querySelector('[data-course-id=wed-late]').getBoundingClientRect().top,summary:el.querySelector('.next-course')?.outerHTML,summaryHeight:el.querySelector('.next-course')?.getBoundingClientRect().height}));assert.ok(Math.abs(after.scroll-before.scroll)<2,JSON.stringify({before,after}));
 });
 await pass('切换控件位置稳定，无顶部重置/二次滚动，不读课表/重发ready/sync，编辑与焦点分离',async()=>{
  await seed('grid');await reveal('wed-focus');await enter('周三数学');const old=await page.locator('.primary-navigation').boundingBox();await page.evaluate(()=>{window.appReads=0;const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(key==='app')window.appReads++;return get.call(this,key);};window.modeScrolls=[];document.querySelectorAll('.tab-screen').forEach(screen=>screen.addEventListener('scroll',()=>{if(screen.classList.contains('active'))window.modeScrolls.push(screen.scrollTop);}));});const before=await page.evaluate(()=>({ready:window.nativeMessages.filter(m=>m.type==='ready').length,sync:window.nativeMessages.filter(m=>m.type==='sync').length}));await switchMode('列表');const after=await page.locator('.primary-navigation').boundingBox();assert.ok(Math.abs(old.y-after.y)<2);assert.ok(Math.abs(old.x-after.x)<2);assert.equal(await page.locator('.resize-handle').count(),0);await comfortable('wed-focus');const evidence=await page.evaluate(()=>({ready:window.nativeMessages.filter(m=>m.type==='ready').length,sync:window.nativeMessages.filter(m=>m.type==='sync').length,reads:window.appReads,scrolls:window.modeScrolls}));assert.equal(evidence.ready,before.ready);assert.equal(evidence.sync,before.sync);assert.equal(evidence.reads,0);assert.ok(evidence.scrolls.length<=1,JSON.stringify(evidence));assert.ok(evidence.scrolls.every(value=>value>0));await switchMode('平铺');await comfortable('wed-focus');assert.equal(await page.locator('.resize-handle').count(),0);await clock('2026-10-07T01:05:00Z');await seed('grid');const first=await page.locator('.primary-navigation').boundingBox();await switchMode('列表');const second=await page.locator('.primary-navigation').boundingBox();assert.ok(Math.abs(first.y-second.y)<2,JSON.stringify({first,second}));await switchMode('平铺');const third=await page.locator('.primary-navigation').boundingBox();assert.ok(Math.abs(first.y-third.y)<2);
 });
 await pass('旧课表迁移后字段/ID保留，缩放/深色/横屏切换焦点仍可见',async()=>{
  await seed('list',true);assert.equal(await page.locator('.screen.active [data-course-id=legacy]').count(),1);await switchMode('平铺');await comfortable('legacy');await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),r=store.get('app');r.onsuccess=()=>store.put({...r.result,settings:{...r.result.settings,scale:.85,mode:'dark'}},'app');await new Promise(resolve=>tx.oncomplete=resolve);db.close();});await page.reload();await page.locator('.week-grid').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.mode),'dark');for(const viewport of [{width:320,height:640},{width:844,height:390}]){await page.setViewportSize(viewport);await reveal('legacy');await switchMode('列表');await comfortable('legacy');await switchMode('平铺');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}await page.setViewportSize({width:390,height:844});
 });
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/home-interaction-results.json',JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));await page.screenshot({path:'build/evidence/home-focus-grid.png'});
}finally{await browser.close();}
