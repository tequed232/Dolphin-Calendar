import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const active=()=>page.locator('.screen.active');
async function seed(courses,patch={}){
  await page.evaluate(async({courses,patch})=>{
    const {initialData}=await import('/src/lib/model.ts');
    const data=initialData();data.onboarded=true;data.settings.mode='light';
    data.schedule.term={name:'用户体验检查',startDate:'2026-09-28',weeks:3};
    data.schedule.courses=courses;Object.assign(data.settings,patch);
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{courses,patch});
  await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await active().locator('.home-inner').waitFor();
}
async function select(date){await page.evaluate(value=>window.dispatchEvent(new CustomEvent('dolphin-date',{detail:value})),date);await page.waitForFunction(value=>document.querySelector('.term-row [role=status]')?.getAttribute('aria-label')?.startsWith(value),date);}
async function revealAction(locator){
  const box=await locator.boundingBox(),dock=await page.locator('.dock').boundingBox();
  if(box.y+box.height>dock.y-12)await active().evaluate((el,distance)=>el.scrollBy({top:distance,behavior:'instant'}),box.y+box.height-dock.y+12);
  const visible=await locator.boundingBox();assert.ok(visible.y>=0&&visible.y+visible.height<=dock.y-11,'操作按钮应能完整滚到 Dock 上方');
}
function course(id,name,day,start,end,weeks,teacher='陈老师',room='16栋203号教室'){return {id,name,day,start,end,weeks,teacher,room,color:'sage',notes:''};}
await mkdir('build/evidence',{recursive:true});
try{
  await page.clock.setFixedTime(new Date(2026,9,3,9));
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
  await seed([]);
  await active().getByRole('button',{name:'没有课表文件？手动添加',exact:true}).click();
  await page.getByRole('dialog',{name:'添加课程',exact:true}).waitFor();
  assert.equal(await page.getByLabel('课程名',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  await goTab(page,'列表');
  await active().getByRole('button',{name:'导入我的课表',exact:true}).click();
  await pasteJSON(page);await active().getByRole('textbox',{name:'课表内容',exact:true}).waitFor();
  pass('空课表首页可直接手动添加或进入 JSON 导入，不必寻找设置入口');

  await goTab(page,'搜索');
  await active().getByRole('button',{name:'手动添加课程',exact:true}).click();
  await page.getByRole('dialog',{name:'添加课程',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  await goTab(page,'搜索');
  await active().getByRole('button',{name:'导入课表',exact:true}).click();
  await pasteJSON(page);await active().getByRole('textbox',{name:'课表内容',exact:true}).waitFor();
  pass('空课表搜索页也能直接导入、手动添加第一门课');

  await goTab(page,'搜索');
  await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill('数学');
  assert.equal(await active().getByRole('heading',{name:'先添加你的课表',exact:true}).count(),1);
  assert.equal(await page.locator('#search-result-status').textContent(),'课表中还没有课程');
  await page.getByRole('button',{name:'清空搜索',exact:true}).click();
  assert.equal(await page.getByRole('searchbox',{name:'搜索课程',exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('searchbox',{name:'搜索课程',exact:true}).evaluate(el=>document.activeElement===el),true);
  pass('没有课程时输入关键词不会伪装成匹配失败，清除后仍可继续输入');

  const courses=[course('math','高等数学',1,1,2,[1]),course('design','交互设计',3,3,4,[2],'李老师','27栋305号教室'),course('english','大学英语',5,5,6,[1,3],'赵老师','8栋102号教室')];
  await seed(courses);
  assert.match(await page.locator('.selected-day-empty').innerText(),/第 1 周的星期六没有安排课程/);
  assert.equal(await page.locator('.timetable .course-card').count(),0);
  await active().getByRole('button',{name:'查看 10 月 7 日课程',exact:true}).click();
  assert.match(await page.locator('.term-row [role=status]').getAttribute('aria-label'),/^2026-10-07/);
  assert.equal(await page.locator('.timetable .course-card').count(),1);
  assert.match(await page.locator('.timetable .course-card').innerText(),/交互设计/);
  assert.match(await page.locator('.next-course').innerText(),/当天第一节/);
  pass('无课日说明实际周次与星期，建议按钮跳到下一次实际有课日期');

  await select('2026-09-30');
  assert.match(await page.locator('.selected-day-empty').innerText(),/当前是第 1 周/);
  assert.equal(await page.locator('.timetable .course-card').count(),0);
  assert.equal(await page.locator('.other-week-disclosure').getAttribute('open'),null);
  await page.locator('.other-week-disclosure summary').click();
  assert.match(await page.locator('.other-week-list .course-card').innerText(),/第 2 周/);
  assert.match(await page.locator('.other-week-disclosure summary').innerText(),/不在所选日期上课/);
  await select('2026-10-02');
  assert.equal(await page.locator('.other-week-disclosure').count(),0);
  pass('其他周课程保持默认折叠并明确归属，选择日期后只显示当天真实课程');

  await select('2026-09-20');
  assert.match(await page.locator('.selected-day-empty').innerText(),/早于课表第 1 周.*2026\/09\/28/);
  await active().getByRole('button',{name:'查看 9 月 28 日课程',exact:true}).click();
  assert.match(await page.locator('.timetable .course-card').innerText(),/高等数学/);
  await select('2026-11-01');
  assert.match(await page.locator('.selected-day-empty').innerText(),/超出课表的 3 周范围/);
  await active().getByRole('button',{name:'查看本学期有课日期',exact:true}).click();
  assert.match(await page.locator('.term-row [role=status]').getAttribute('aria-label'),/^2026-09-28/);
  pass('学期前、学期后空状态给出原因，并能返回实际有课日期');

  await select('2026-10-03');
  await active().getByRole('button',{name:'打开月历选日期',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'选择日期',exact:true}).count(),1);
  await page.getByRole('button',{name:'2026-10-07，1 门课程',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'选择日期',exact:true}).count(),0);
  assert.equal(await page.locator('.timetable .course-card').count(),1);
  pass('空状态月历按钮复用应用月历，点选日期更新真实日程');

  await select('2026-10-02');
  assert.equal(await page.locator('.nav-fab').count(),0);
  await select('2026-10-07');
  assert.equal(await page.locator('.nav-fab').count(),1);
  assert.match(await page.locator('.nav-fab').getAttribute('title'),/交互设计/);
  await page.clock.setFixedTime(new Date(2026,9,2,13));await page.reload();
  assert.match(await page.locator('.next-course').innerText(),/下一节课/);
  await page.clock.setFixedTime(new Date(2026,9,2,14,20));await page.reload();
  assert.match(await page.locator('.next-course').innerText(),/正在上课/);
  await page.clock.setFixedTime(new Date(2026,9,2,16));await page.reload();
  assert.equal(await page.locator('.next-course').count(),0);
  assert.equal(await page.locator('.nav-fab').count(),0);
  assert.match(await page.locator('.free-day').innerText(),/今天的课程已结束/);
  pass('主页导航目标与所选日期一致，课前、上课中、已结束状态按实际节次切换');

  await goTab(page,'搜索');
  const input=page.getByRole('searchbox',{name:'搜索课程',exact:true});
  await input.fill('  李老师  ');
  assert.equal(await page.locator('.result-card').count(),1);
  assert.match(await page.locator('.result-card').innerText(),/交互设计/);
  assert.equal(await page.locator('#search-result-status').textContent(),'找到 1 门匹配课程');
  assert.equal(await page.locator('.result-card mark').textContent(),'李老师');
  await page.getByRole('button',{name:'清空搜索',exact:true}).click();
  assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('.result-card').count(),3);
  await input.fill('27栋305');
  assert.equal(await page.locator('.result-card').count(),1);
  await input.fill('不存在的课程');
  assert.equal(await page.locator('.result-card').count(),0);
  assert.equal(await page.locator('#search-result-status').textContent(),'找到 0 门匹配课程');
  await page.getByRole('button',{name:'查看全部课程',exact:true}).click();
  assert.equal(await input.inputValue(),'');assert.equal(await page.locator('.result-card').count(),3);
  await page.locator('.result-card').filter({hasText:'交互设计'}).click();
  await page.getByRole('heading',{name:'交互设计',exact:true}).waitFor();
  assert.match(await page.locator('.course-sheet').innerText(),/27栋305号教室/);
  pass('搜索支持教师、教室和前后空格，实时计数、清除焦点、无结果恢复及课程详情都可用');
  await page.locator('.course-sheet').getByRole('button',{name:'关闭课程详情',exact:true}).click();

  await page.setViewportSize({width:330,height:640});
  await seed([],{scale:1.1,mode:'dark'});
  await goTab(page,'搜索');
  const query=page.getByRole('searchbox',{name:'搜索课程',exact:true});
  await query.fill('测试输入字段不会挤出屏幕');
  const fit=await page.locator('.search-box').evaluate(el=>{const a=el.getBoundingClientRect(),input=el.querySelector('input').getBoundingClientRect(),clear=el.querySelector('button').getBoundingClientRect();return {right:a.right,inputRight:input.right,clearLeft:clear.left,clearRight:clear.right,width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};});
  assert.ok(fit.right<=fit.width&&fit.inputRight<=fit.clearLeft&&fit.clearRight<=fit.width);
  assert.equal(fit.scroll,fit.width);
  await revealAction(active().getByRole('button',{name:'手动添加课程',exact:true}));
  await page.screenshot({path:`build/evidence/${version}-search-empty-dark-narrow.png`});
  await goTab(page,'列表');
  await revealAction(active().getByRole('button',{name:'没有课表文件？手动添加',exact:true}));
  const homeOverflow=await active().evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(homeOverflow<=1);
  await page.screenshot({path:`build/evidence/${version}-home-empty-dark-narrow.png`});
  await seed(courses,{scale:1.1,mode:'dark'});await select('2026-11-01');
  await revealAction(active().getByRole('button',{name:'打开月历选日期',exact:true}));
  const emptyOverflow=await page.locator('.selected-day-empty').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(emptyOverflow<=1);
  await page.screenshot({path:`build/evidence/${version}-home-date-empty-dark-narrow.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'打开月历选日期',exact:true}).click();
  await page.getByRole('button',{name:'2026-11-01，无课程',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'选择日期',exact:true}).count(),0);
  assert.equal(await page.locator('.dock').count(),1);
  pass('330×640、110% 比例、深色与减少动态效果下，输入、清除、空状态操作均无横向溢出');
  await seed(courses,{showTimes:false});await select('2026-10-07');
  assert.equal(await page.locator('.period-label > span').count(),0);
  assert.equal(await page.locator('.timetable .course-topline > span').count(),1);
  assert.doesNotMatch(await page.locator('.next-time').innerText(),/\d{2}:\d{2}/);
  await page.reload();await select('2026-10-07');
  assert.equal(await page.locator('.period-label > span').count(),0);
  await seed(courses,{showTimes:true});await select('2026-10-07');
  assert.ok(await page.locator('.period-label > span').count()>0);
  assert.equal(await page.locator('.timetable .course-topline > span').count(),2);
  assert.match(await page.locator('.next-time').innerText(),/\d{2}:\d{2}/);
  pass('列表时间显示与偏好一致，隐藏后刷新仍生效，重新开启恢复课程时间');
  const dated={...course('dated','临时讲座',3,1,2,[1]),temporary:true,specificDate:'2026-10-07'};
  await seed([dated]);await select('2026-10-07');
  await page.locator('.timetable .course-card').click();
  assert.match(await page.locator('.course-sheet .detail-row').filter({hasText:'上课日期'}).innerText(),/2026\/10\/07/);
  assert.equal(await page.locator('.course-sheet .detail-row').filter({hasText:'上课周次'}).count(),0);
  await page.locator('.course-sheet').getByRole('button',{name:'关闭课程详情',exact:true}).click();
  pass('指定日期临时课程的详情展示实际日期，不误标为重复上课周次');
  assert.deepEqual(errors,[]);
  await writeFile(`build/evidence/${version}-home-search-experience-results.json`,JSON.stringify({version,checks,errors},null,2));
}finally{await browser.close();}
