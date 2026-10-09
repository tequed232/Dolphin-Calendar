import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import * as XLSX from '@e965/xlsx';
import {launchBrowser} from './check-browser.mjs';
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await mkdir('build/evidence',{recursive:true});
const api='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1],nextVersion=version.replace(/\d+$/,patch=>String(Number(patch)+1));
let release={tag_name:`v${version}`,name:'当前版本',body:'当前版本',published_at:'2026-10-07T00:00:00Z',html_url:`https://github.com/tequed232/Dolphin-Calendar/releases/tag/v${version}`};
await page.route(api,route=>route.fulfill({json:release}));
async function state(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);});db.close();return data;});}
async function seed(fn){const data=await state(),next=fn(data);await page.evaluate(async value=>{const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'app');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},next);await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});}
async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label);}
async function home(){await goTab(page,(await state()).settings.timetableMode==='grid'?'平铺':'列表');}
async function settings(route){if(['editor','schedule-settings','period-count','times'].includes(route)){await home();await page.getByRole('button',{name:'课表管理',exact:true}).click();if(route==='times')await page.getByRole('button',{name:'上课时间',exact:true}).click();else if(route!=='editor')await page.getByRole('button',{name:/开学日期与课程节数/}).click();}else{await goTab(page,'设置');await page.locator(`[data-setting="${route}"]`).click();}}
async function file(name,buffer){await page.locator('.screen.active .home-header-actions').getByRole('button',{name:'导入课表',exact:true}).click();await page.locator('.screen.active input[type=file]').setInputFiles({name,mimeType:name.endsWith('.json')?'application/json':'application/octet-stream',buffer});}
async function drag(name,rows){if(!await page.getByRole('button',{name:`${name}结束节次拖动`}).count())await page.getByRole('button',{name:`${name}调整布局`,exact:true}).click({force:true});const handle=page.getByRole('button',{name:`${name}结束节次拖动`});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox(),first=await page.locator('.grid-period[data-period="1"]').boundingBox(),second=await page.locator('.grid-period[data-period="2"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+rows*(second.y-first.y),{steps:8});await page.mouse.up();}
try{
 await page.clock.setFixedTime(new Date(2026,9,7,9));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await seed(data=>({...data,schedule:{...data.schedule,term:{name:'测试学期',startDate:'2026-09-01',weeks:20},periods:data.schedule.periods.slice(0,8)}}));
 await check('JSON 从8节导入12节，同步设置/日期/网格/时间且确认前不覆盖',async()=>{
  const periods=Array.from({length:12},(_,i)=>{const begin=480+i*55;const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;return {start:clock(begin),end:clock(begin+45)};});
  await file('schedule.json',Buffer.from(JSON.stringify({semester:{startDate:'2026-09-07'},schedule:{courseCount:12,times:periods,courses:[{name:'数学',day:1,start:1,end:2,weeks:[1,2,3,4,5]},{name:'英语',day:3,start:8,end:9,weeks:[5]}]}})));
  await page.getByRole('dialog',{name:'确认这份课表'}).waitFor();assert.equal((await state()).schedule.periods.length,8);await page.getByRole('button',{name:'确认导入',exact:true}).click();await goTab(page,'列表');await page.locator('[data-screen="list"].active').waitFor();
  assert.equal((await state()).schedule.term.startDate,'2026-09-07');assert.equal((await state()).schedule.periods.length,12);
  await goTab(page,'平铺');await page.locator('.grid-period').first().waitFor();assert.equal(await page.locator('.grid-period').count(),12);await settings('schedule-settings');assert.equal(await page.getByRole('button',{name:'开学日期',exact:true}).innerText(),'2026/09/07');assert.equal(await page.getByLabel('课程节数',{exact:true}).inputValue(),'12');await home();
 });
 await check('周三第5节空白格创建临时课程，只填名称即可保存和立即显示',async()=>{
  await page.getByRole('button',{name:'周三第5节添加临时课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'添加临时课程'});await editor.getByLabel('课程名',{exact:true}).fill('自习');await editor.getByRole('button',{name:'保存课程',exact:true}).click();await page.locator('.grid-course.temporary').waitFor();const c=(await state()).schedule.courses.find(c=>c.name==='自习');assert.equal(c.day,3);assert.equal(c.start,5);assert.equal(c.end,5);assert.equal(c.specificDate,'2026-10-07');
 });
 await check('临时课程底部拖动5→7吸附保存，点击查看后可编辑，冲突拖动提示可取消',async()=>{
  await drag('自习',2);await page.waitForFunction(()=>document.querySelector('.grid-course.temporary .grid-course-content').innerText.includes('临时'));await page.waitForTimeout(250);assert.equal((await state()).schedule.courses.find(c=>c.name==='自习').end,7);
  await page.locator('.grid-course-content').filter({hasText:'英语'}).click();await page.getByRole('dialog').getByRole('button',{name:'编辑这门课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'编辑课程'});await editor.waitFor();assert.equal(await editor.getByLabel('课程名',{exact:true}).inputValue(),'英语');await editor.getByRole('button',{name:'取消',exact:true}).click();
  await drag('自习',1);const conflict=page.getByRole('dialog',{name:'课程时间冲突'});await conflict.waitFor();assert.match(await conflict.innerText(),/英语/);await conflict.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await state()).schedule.courses.find(c=>c.name==='自习').end,7);
  await page.reload();await page.locator('.grid-course.temporary').waitFor();assert.equal((await state()).schedule.courses.find(c=>c.name==='自习').end,7);
 });
 await check('界面缩放85%时拖动按实际行高吸附，不偏移课程节次',async()=>{
  await seed(data=>({...data,settings:{...data.settings,scale:.85},schedule:{...data.schedule,courses:data.schedule.courses.map(c=>c.name==='自习'?{...c,start:1,end:1}:c)}}));
  await drag('自习',5);await page.waitForTimeout(250);assert.equal((await state()).schedule.courses.find(c=>c.name==='自习').end,6);
  await page.locator('.grid-course-content').filter({hasText:'自习'}).click();await page.getByRole('dialog').getByRole('button',{name:'编辑这门课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'编辑课程'});await editor.waitFor();await editor.getByRole('button',{name:'取消',exact:true}).click();
  await seed(data=>({...data,settings:{...data.settings,scale:1},schedule:{...data.schedule,courses:data.schedule.courses.map(c=>c.name==='自习'?{...c,start:5,end:7}:c)}}));
 });
 await check('确认同时保留冲突课程后真实分列，同段与跨段重叠课程均可查看和编辑',async()=>{
  const baseline=await state();
  await page.getByRole('button',{name:'添加临时课程',exact:true}).click();const add=page.getByRole('dialog',{name:'添加临时课程'});
  // Toolbar is in document flow: scrolling to it can update the reading date. Choose the intended date explicitly.
  await add.getByLabel('日期（留空按周次重复）',{exact:true}).fill('2026-10-07');assert.equal(await add.getByLabel('日期（留空按周次重复）',{exact:true}).inputValue(),'2026-10-07');
  await add.getByLabel('课程名',{exact:true}).fill('冲突自习');await add.getByRole('button',{name:'开始节次',exact:true}).click();await add.getByRole('option',{name:'第 5 节',exact:true}).click();await add.getByRole('button',{name:'持续节数',exact:true}).click();await add.getByRole('option',{name:'3 节',exact:true}).click();await add.getByRole('button',{name:'保存课程',exact:true}).click();
  const conflict=page.getByRole('dialog',{name:'课程时间冲突'});await conflict.waitFor();assert.match(await conflict.innerText(),/自习/);await conflict.getByRole('button',{name:'仍然保存',exact:true}).click();await page.locator('.grid-course-content').filter({hasText:'冲突自习'}).waitFor();assert.equal((await state()).schedule.courses.length,4);
  await seed(data=>({...data,schedule:{...data.schedule,courses:[...data.schedule.courses,{...data.schedule.courses.find(c=>c.name==='自习'),id:'overlap-bridge',name:'跨段自习',start:6,end:8}]}}));
  for(const name of ['自习','冲突自习','跨段自习','英语']){
   const card=page.locator('.grid-course-content').filter({has:page.locator('strong',{hasText:new RegExp(`^${name}$`)})});await card.click();await page.getByRole('dialog').getByRole('button',{name:'编辑这门课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'编辑课程'});await editor.waitFor();assert.equal(await editor.getByLabel('课程名',{exact:true}).inputValue(),name);await editor.getByRole('button',{name:'取消',exact:true}).click();
  }
  await seed(()=>baseline);
 });
 await check('课程节数12→14即时更新，减少有课节次需确认且课程保留',async()=>{
  await settings('period-count');await page.getByLabel('课程节数',{exact:true}).selectOption('14');await page.getByRole('button',{name:'保存课表设置',exact:true}).click();await home();assert.equal(await page.locator('.grid-period').count(),14);
  await settings('period-count');await page.getByLabel('课程节数',{exact:true}).selectOption('6');const confirm=page.getByRole('dialog',{name:'减少课程节数？'});await confirm.waitFor();await confirm.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.getByLabel('课程节数',{exact:true}).inputValue(),'14');await page.getByLabel('课程节数',{exact:true}).selectOption('6');await confirm.getByRole('button',{name:'继续减少',exact:true}).click();await page.getByRole('button',{name:'保存课表设置',exact:true}).click();assert.equal((await state()).schedule.courses.length,3);await page.getByLabel('课程节数',{exact:true}).selectOption('14');await page.getByRole('button',{name:'保存课表设置',exact:true}).click();await home();
 });
 await page.screenshot({path:'build/evidence/schedule-grid-light.png',fullPage:true});
 await check('真实Excel多Sheet选择，纵向合并数学只生成一个课程块，预览取消保留原课表',async()=>{
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['节次','星期一','Tue'],[1,'数学','英语'],[2,'','']]);sheet['!merges']=[{s:{r:1,c:1},e:{r:2,c:1}}];XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['说明']]),'说明');XLSX.utils.book_append_sheet(book,sheet,'课表');
  await file('courses.xlsx',Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})));await page.getByLabel('选择工作表').selectOption('1');await page.getByRole('button',{name:'查看导入预览'}).click();const preview=page.getByRole('dialog',{name:'确认这份课表'});assert.equal(await preview.locator('.preview-list p').count(),2);assert.match(await preview.innerText(),/1–2 节/);assert.equal((await state()).schedule.courses.length,3);await preview.getByRole('button',{name:'返回修改',exact:true}).click();await home();
 });
 await check('损坏Excel给出错误，CSV有效行与错误明细可预览，原数据未覆盖',async()=>{
  await file('broken.xlsx',Buffer.from('broken'));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/无法解析该 Excel 文件/);await page.getByRole('dialog',{name:'读取课表'}).getByRole('button',{name:'取消',exact:true}).click();await home();
  await file('courses.csv',Buffer.from('课程名,星期,节次\n数学,Mon,1-2\n坏课程,周八,3'));const reader=page.getByRole('dialog',{name:'读取课表'});await reader.getByText(/跳过 1 项/).waitFor();await reader.getByRole('button',{name:'查看导入预览'}).click();await page.getByRole('dialog',{name:'确认这份课表'}).getByRole('button',{name:'返回修改'}).click();assert.equal((await state()).schedule.courses.length,3);await home();
 });
 await check('正式新版显示更新图标和标题/日期，API失败不影响课表',async()=>{
  assert.equal(await page.locator('.screen.active .home-header-actions button').count(),2);release={...release,tag_name:`v${nextVersion}`,name:'新版本标题',body:'更好的课表',html_url:`https://github.com/tequed232/Dolphin-Calendar/releases/tag/v${nextVersion}`};await settings('about');await page.getByRole('button',{name:/应用更新/}).click();await page.getByRole('button',{name:'立即检查更新'}).click();await page.getByText('新版本标题',{exact:true}).waitFor();await home();assert.equal(await page.locator('.screen.active .home-header-actions button').count(),3);
  await page.locator('.screen.active .update-indicator').click();assert.match(await page.locator('.screen.active').innerText(),/发布于/);await page.unroute(api);await page.route(api,route=>route.abort());await page.getByRole('button',{name:'立即检查更新'}).click();await page.getByText('暂时无法检查更新，请稍后重试',{exact:true}).waitFor();await home();assert.equal(await page.locator('.grid-period').count(),14);
 });
 await check('小屏/桌面/横屏/深色，14节7天和长文本不造成页面横向溢出',async()=>{
  await seed(data=>({...data,schedule:{...data.schedule,courses:data.schedule.courses.map(c=>({...c,name:c.name+'课程名称'.repeat(15),teacher:'教师名称'.repeat(10),room:'教室地址'.repeat(15)}))},settings:{...data.settings,mode:'dark'}}));
  for(const viewport of [{width:320,height:640},{width:820,height:1180},{width:844,height:390},{width:1280,height:800}]){await page.setViewportSize(viewport);await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.grid-period').count(),14);assert.equal(await page.locator('.grid-day').count(),7);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'build/evidence/schedule-grid-dark.png',fullPage:true});
 });
 assert.deepEqual(errors,[]);await writeFile('build/evidence/schedule-ui-results.json',JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
