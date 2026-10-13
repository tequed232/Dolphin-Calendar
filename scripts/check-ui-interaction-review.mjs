import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),results=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
await mkdir('build/evidence',{recursive:true});
async function check(name,run){await run();results.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const value=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return value;});}
async function focus(){return page.evaluate(()=>({text:document.activeElement?.textContent,role:document.activeElement?.getAttribute('role'),label:document.activeElement?.getAttribute('aria-label')}));}
async function menuFits(label){
 const bounds=await page.getByRole('listbox',{name:label,exact:true}).evaluate(menu=>{
  const box=menu.getBoundingClientRect(),dialog=menu.closest('dialog'),clip=dialog?.getBoundingClientRect()??{top:0,bottom:innerHeight},heading=dialog?.querySelector('.dialog-heading')?.getBoundingClientRect();
  const option=document.activeElement,selected=option?.getBoundingClientRect(),hit=selected&&document.elementFromPoint(selected.x+selected.width/2,selected.y+selected.height/2);
  return {top:box.top,bottom:box.bottom,height:box.height,clipTop:Math.max(clip.top,heading?.bottom??0),clipBottom:clip.bottom,selectedTop:selected?.top,selectedBottom:selected?.bottom,hitOption:!!hit&&option.contains(hit)};
 });
 assert.ok(bounds.height>=44,JSON.stringify(bounds));assert.ok(bounds.top>=bounds.clipTop-1&&bounds.bottom<=bounds.clipBottom+1,JSON.stringify(bounds));
 assert.ok(bounds.selectedTop>=bounds.top-1&&bounds.selectedBottom<=bounds.bottom+1,JSON.stringify(bounds));assert.equal(bounds.hitOption,true,JSON.stringify(bounds));
}
try{
 await page.addInitScript(()=>{
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(window.__failAppSave&&this.name==='state'&&args[1]==='app')throw new DOMException('审查测试保存失败','QuotaExceededError');return put.apply(this,args);};
  const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite'){const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');Object.defineProperty(tx,'oncomplete',{set(handler){descriptor.set.call(tx,handler?event=>{if(window.__saveDelay)setTimeout(()=>handler.call(tx,event),window.__saveDelay);else handler.call(tx,event);}:null);},get(){return descriptor.get.call(tx);}});}return tx;};
 });
 await page.route('https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest',route=>route.fulfill({status:503,body:'review fixture'}));
 await page.goto(url);await page.locator('.load-note').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
  const {initialData}=await import('/src/lib/model.ts'),data=initialData();data.onboarded=true;data.settings.school='审查示例大学';
  data.schedule.courses=[{id:'ui-review-course',name:'交互审查课程',teacher:'示例老师',room:'16栋203号教室',day:1,start:1,end:2,weeks:[1],color:'sage',notes:''}];
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 });await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});
 await goTab(page,'设置');await page.locator('[data-setting=appearance]').click();const mode=page.getByRole('button',{name:'深浅模式',exact:true});
 await check('选择器方向键打开后聚焦当前项，方向键与 Enter 更新并保存',async()=>{
  await mode.focus();await page.keyboard.press('ArrowDown');assert.equal((await focus()).role,'option');assert.equal((await focus()).text,'跟随系统✓');
  await page.keyboard.press('ArrowDown');assert.equal((await focus()).text,'浅色 · 晴日');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.mode==='light');assert.equal((await state()).settings.mode,'light');assert.equal((await focus()).label,'深浅模式');assert.equal(await page.locator('.choice-menu').count(),0);
 });
 await check('Home、End 与空格选择兼容列表首尾和持久化',async()=>{
  await mode.press('ArrowUp');await page.keyboard.press('Home');assert.equal((await focus()).text,'跟随系统');await page.keyboard.press('End');assert.equal((await focus()).text,'深色 · 夜航');await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.documentElement.dataset.mode==='dark');assert.equal((await state()).settings.mode,'dark');assert.equal((await focus()).label,'深浅模式');
 });
 await check('Tab 关闭选择器并进入下个字段，Shift+Tab 可回到触发器',async()=>{
  await mode.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await page.locator('.choice-menu').count(),0);assert.equal((await focus()).label,'界面缩放');await page.keyboard.press('Shift+Tab');assert.equal((await focus()).label,'深浅模式');
  await mode.press('ArrowDown');await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.choice-menu').count(),0);assert.notEqual((await focus()).role,'option');
 });
 await goTab(page,'列表');await page.getByRole('button',{name:'添加临时课程',exact:true}).click();const editor=page.getByRole('dialog',{name:'添加临时课程',exact:true});
 await check('编辑草稿中的 Escape 只关闭选项，不关闭父弹窗或丢弃文字',async()=>{
  await editor.getByRole('textbox',{name:'课程名',exact:true}).fill('还未保存的草稿');await editor.getByRole('button',{name:'星期',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await editor.count(),1);assert.equal(await page.locator('.choice-menu').count(),0);assert.equal(await page.getByRole('dialog',{name:'修改还未保存',exact:true}).count(),0);assert.equal(await editor.getByRole('textbox',{name:'课程名',exact:true}).inputValue(),'还未保存的草稿');
 });
 const start=editor.getByRole('button',{name:'开始节次',exact:true});
 await check('键盘缩短可见 Dialog 后菜单不被裁切，末节可滚动选择',async()=>{
  await page.evaluate(()=>window.dolphinInsets(28,24,340,844));await start.click();await page.keyboard.press('End');await menuFits('开始节次');await page.keyboard.press('Enter');assert.equal(await start.innerText(),'第 12 节');
  await start.click();await menuFits('开始节次');await page.screenshot({path:`build/evidence/${version}-keyboard-choice.png`});await page.keyboard.press('Escape');
 });
 await check('菜单打开期间键盘安全区变化实时重新定位，仍能选择',async()=>{
  await page.evaluate(()=>window.dolphinInsets(0,0,0,844));await start.click();await page.evaluate(()=>window.dolphinInsets(28,24,340,844));await page.waitForTimeout(100);await menuFits('开始节次');await page.keyboard.press('Home');await page.keyboard.press('Enter');assert.equal(await start.innerText(),'第 1 节');
 });
 await check('小屏与 110% 字号的菜单可见且末节仍可操作',async()=>{
  await page.evaluate(()=>{window.dolphinInsets(0,0,0,568);document.documentElement.style.setProperty('--ui-scale','1.1');});await page.setViewportSize({width:320,height:568});await start.click();await page.keyboard.press('End');await menuFits('开始节次');await page.keyboard.press('Enter');assert.equal(await start.innerText(),'第 12 节');
 });
 await check('横屏短视口保留可见选项、首末键和正常草稿保护',async()=>{
  await page.evaluate(()=>{window.dolphinInsets(0,0,0,390);document.documentElement.style.setProperty('--ui-scale','1');});await page.setViewportSize({width:844,height:390});await start.click();await page.keyboard.press('Home');await menuFits('开始节次');await page.keyboard.press('End');await menuFits('开始节次');await page.keyboard.press('Escape');
  await editor.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('dialog',{name:'修改还未保存',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();assert.equal(await editor.count(),0);assert.equal((await state()).schedule.courses.length,1);
 });
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.dolphinInsets(0,0,0,844));await goTab(page,'搜索');const result=page.locator('.screen.active .result-card').first();
 await check('关闭课程详情后键盘焦点返回原结果，滚动位置保持',async()=>{
  await result.focus();const before=await page.locator('.screen.active').evaluate(el=>el.scrollTop);await page.keyboard.press('Enter');await page.locator('.course-sheet').waitFor();
  assert.equal(await page.locator('.screen-host').evaluate(el=>el.inert),true);await result.evaluate(el=>el.focus());assert.equal(await result.evaluate(el=>document.activeElement===el),false);
  await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await page.locator('.screen-host').evaluate(el=>el.inert),false);assert.equal(await result.evaluate(el=>document.activeElement===el),true);assert.equal(await page.locator('.screen.active').evaluate(el=>el.scrollTop),before);
 });
 await check('详情内教材弹窗关闭后先返回详情，Escape 再回到原课程',async()=>{
  await page.keyboard.press('Enter');await page.getByRole('button',{name:'手动填写教材',exact:true}).click();await page.getByRole('dialog',{name:'标记教材',exact:true}).getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('.course-sheet').count(),1);assert.equal((await focus()).text,'手动填写教材');await page.keyboard.press('Escape');await page.waitForTimeout(100);assert.equal(await result.evaluate(el=>document.activeElement===el),true);
 });
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:/开学日期与课程节数/}).click();const termName=page.getByRole('textbox',{name:'课表名称',exact:true});
 await check('学期慢保存期间字段和配置入口锁定，不接收随后会被覆盖的输入',async()=>{
  await termName.fill('慢保存核对学期');await page.evaluate(()=>window.__saveDelay=700);await page.getByRole('button',{name:'保存课表设置',exact:true}).click();
  assert.equal(await termName.isDisabled(),true);assert.equal(await page.getByRole('spinbutton',{name:'学期周数',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('课程节数',{exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'开学日期',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'保存课表设置',exact:true}).waitFor();await page.evaluate(()=>window.__saveDelay=0);assert.equal(await termName.isEnabled(),true);assert.equal(await termName.inputValue(),'慢保存核对学期');assert.equal((await state()).schedule.term.name,'慢保存核对学期');
 });
 await check('设置写入失败后立即解锁，草稿和原存储保留，可重试成功',async()=>{
  const original=(await state()).schedule;await termName.fill('失败后保留的学期草稿');await page.evaluate(()=>window.__failAppSave=true);await page.getByRole('button',{name:'保存课表设置',exact:true}).click();await page.locator('.screen.active .field-error[role=alert]').waitFor();
  assert.equal(await termName.isEnabled(),true);assert.equal(await termName.inputValue(),'失败后保留的学期草稿');assert.deepEqual((await state()).schedule,original);
  await page.evaluate(()=>window.__failAppSave=false);await page.getByRole('button',{name:'保存课表设置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.screen.active input')?.disabled===false&&document.querySelector('.screen.active .primary')?.disabled===true);assert.equal((await state()).schedule.term.name,'失败后保留的学期草稿');
 });
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:'上课时间',exact:true}).click();
 await check('逐节作息慢保存期间所有时间字段与自动顺延入口均锁定，结束恢复',async()=>{
  const first=page.getByLabel('第1节开始',{exact:true});await first.fill('08:01');await page.evaluate(()=>window.__saveDelay=700);await page.getByRole('button',{name:'保存课表设置',exact:true}).click();assert.equal(await first.isDisabled(),true);assert.equal(await page.getByRole('button',{name:/自动顺延后续课程/}).isDisabled(),true);assert.equal(await page.locator('.screen.active input[type=time]').evaluateAll(inputs=>inputs.every(input=>input.matches(':disabled'))),true);
  await page.getByRole('button',{name:'保存课表设置',exact:true}).waitFor();await page.evaluate(()=>window.__saveDelay=0);assert.equal(await first.isEnabled(),true);assert.equal((await state()).schedule.periods[0].start,'08:01');
 });
 assert.deepEqual(errors,[]);
 await writeFile(`build/evidence/${version}-ui-interaction-review.json`,JSON.stringify({version,url,results,errors},null,2));
}catch(error){await page.screenshot({path:'build/evidence/ui-interaction-review-failure.png'});throw error;}finally{await browser.close();}
