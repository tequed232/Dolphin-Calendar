import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1],browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Singapore'});
const checks=[],samples=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.navigationCommands=[];window.Dolphin={postMessage(raw){window.navigationCommands.push(JSON.parse(raw));}};});
const active=()=>page.locator('.screen.active');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function seed(scale){await page.evaluate(async scale=>{const {initialData}=await import('/src/lib/model.ts'),{resizePeriods}=await import('/src/lib/scheduleTime.ts');const data=initialData();data.onboarded=true;data.settings={...data.settings,scale,mode:'dark',autoUpdate:false,timetableMode:'grid'};data.schedule.term={name:'显示布局演示',startDate:'2026-10-05',weeks:20};data.schedule.periods=resizePeriods(data.schedule.periods,14);data.schedule.courses=[{id:'display-course',name:'示例课程与横屏阅读布局',day:3,start:1,end:2,weeks:[1,2],color:'sage',teacher:'示例教师',room:'示例楼203号教室',notes:'供布局验证的合成课程'}];const {saveData}=await import('/src/lib/storage.ts');await saveData(data);},scale);await page.reload();await active().locator('.home-controls').waitFor();await page.waitForTimeout(100);}
function overlap(a,b){return Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1;}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date('2026-10-07T00:00:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}])for(const scale of [1,1.2,1.35]){
  await page.setViewportSize(viewport);await seed(scale);
  await check(viewport.width+'×'+viewport.height+' / '+scale+'：导航真实占位，工具栏不遮挡星期',async()=>{
   const nav=await page.locator('.primary-navigation').boundingBox(),host=await page.locator('.screen-host').boundingBox(),toolbar=await active().locator('.home-controls').boundingBox(),weekday=await active().locator('.grid-day').first().boundingBox();
   assert.ok(!overlap(nav,host));assert.ok(weekday.y>=toolbar.y+toolbar.height-1);assert.equal(await active().locator('.home-controls').evaluate(e=>getComputedStyle(e).position),'relative');
   assert.equal(await page.locator('.primary-navigation>button').count(),4);for(const b of await page.locator('.primary-navigation>button').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()))){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));samples.push({viewport,scale,nav,host,toolbar,weekday});
  });
  await check('课程详情 '+viewport.width+'×'+viewport.height+' / '+scale+'：导航隐藏，标题可关闭、内容可滚动',async()=>{
   await active().locator('[data-course-id="display-course"] .grid-course-content').click();await page.locator('.course-sheet').waitFor();assert.equal(await page.locator('.primary-navigation').count(),0);const sheet=await page.locator('.course-sheet').boundingBox();assert.ok(sheet.y>=-1&&sheet.y+sheet.height<=viewport.height+1);const body=page.locator('.sheet-body');await body.evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await page.getByRole('button',{name:'关闭课程详情',exact:true}).isVisible());await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();await page.locator('.primary-navigation').waitFor();
  });
  await check('月历弹层 '+viewport.width+'×'+viewport.height+' / '+scale+'：只缩放一次，日期可选，关闭可用',async()=>{
   await active().getByRole('button',{name:'选择日期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'选择日期',exact:true});await dialog.waitFor();const box=await dialog.boundingBox();assert.ok(box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,JSON.stringify({viewport,scale,box}));assert.equal(await dialog.locator('.calendar-day').count(),42);assert.equal(await page.locator('.primary-navigation').count(),0);assert.ok(await dialog.getByRole('button',{name:'关闭对话框',exact:true}).isVisible());await dialog.evaluate(e=>e.scrollTop=e.scrollHeight);await dialog.getByRole('button',{name:'回到今天',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('.primary-navigation').waitFor();
  });
  if(scale===1.2)await page.screenshot({path:'build/evidence/'+version+'-navigation-'+viewport.width+'x'+viewport.height+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await seed(1);
 await check('横竖切换保留所选日期与课程资料，侧栏和底栏同步',async()=>{
  await page.evaluate(()=>window.dolphinNative({type:'date',value:'2026-10-14'}));await page.waitForTimeout(100);const date=await active().locator('.home-inner').getAttribute('data-focus-date');
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(150);assert.equal(await active().locator('.home-inner').getAttribute('data-focus-date'),date);assert.equal(await active().locator('[data-course-id="display-course"]').count(),1);}
 });
 await check('输入法隐藏导航并释放占位，关闭后恢复；搜索输入可见',async()=>{
  await goTab(page,'搜索');const input=page.getByRole('searchbox',{name:'搜索课程',exact:true});await input.focus();await page.evaluate(()=>window.dolphinInsets(28,24,320,844));await page.waitForTimeout(150);assert.equal(await page.locator('.primary-navigation').isVisible(),false);const box=await input.boundingBox();assert.ok(box.y+box.height<=524+1);await page.evaluate(()=>{document.activeElement.blur();window.dolphinInsets(28,24,0,844);});await page.waitForTimeout(150);assert.ok(await page.locator('.primary-navigation').isVisible());
 });
 await check('原生能力未确认时保留网页导航；确认后单份导航与真实边距',async()=>{
  await goTab(page,'平铺');assert.equal(await page.locator('.primary-navigation').count(),1);await page.evaluate(()=>window.dolphinNative({type:'nativeNavigation',available:true,bottom:104,left:0,right:0}));await page.waitForTimeout(100);assert.equal(await page.locator('.primary-navigation').count(),0);const host=await page.locator('.screen-host').boundingBox();assert.ok(Math.abs(host.y+host.height-(844-104))<1);
  await page.evaluate(()=>window.dolphinNative({type:'selectTab',value:'search'}));await page.waitForTimeout(100);assert.equal(await active().getAttribute('data-screen'),'search');
  await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{window.dolphinInsets(24,20,0,390);window.dolphinNative({type:'nativeNavigation',available:true,bottom:0,left:96,right:20});});await page.waitForTimeout(100);const railHost=await page.locator('.screen-host').boundingBox();assert.equal(railHost.x,96);assert.equal(railHost.x+railHost.width,824);assert.ok(await page.evaluate(()=>window.navigationCommands.some(c=>c.type==='navigationState'&&c.tab==='search'&&c.layout==='rail')));
 });
 assert.deepEqual(errors,[]);await writeFile('build/evidence/'+version+'-responsive-navigation-results.json',JSON.stringify({version,checks,samples,errors},null,2));
}finally{await browser.close();}
