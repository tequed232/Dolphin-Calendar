import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchBrowser} from './check-browser.mjs';

const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),checks=[],errors=[],contexts=[];
await mkdir('build/evidence',{recursive:true});
const pass=name=>{checks.push(name);console.log('PASS '+name);};
async function fresh(options={}){
  const context=await browser.newContext({viewport:{width:390,height:844},...options});contexts.push(context);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__guideNative=[];window.__guideRejections=[];
    window.Dolphin={postMessage:value=>window.__guideNative.push(JSON.parse(value))};
    window.addEventListener('unhandledrejection',event=>window.__guideRejections.push(String(event.reason)));
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(window.__guideFailWrite&&this.name==='state'){window.__guideFailWrite=false;throw new DOMException('验证：本地写入被拒绝','UnknownError');}return put.apply(this,args);};
  });
  await page.goto(url);await page.locator('.onboarding[data-step="1"]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.load-note'));await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(Number(animation.effect?.getTiming().iterations))).map(animation=>animation.finished.catch(()=>{})));});return page;
}
async function next(page){await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForTimeout(220);}
async function finalStep(page){await next(page);await next(page);await page.locator('.onboarding[data-step="3"]').waitFor();}
async function stored(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return data;});}
async function assertNoPermission(page){
  // updateStatus reads cached metadata only; navigationState only synchronizes the native navigation UI.
  // Neither can request a permission, read a calendar or start a download/live service.
  const messages=await page.evaluate(()=>window.__guideNative),allowed=new Set(['ready','appearance','sync','bookCovers','haptic','history','updateStatus','navigationState']);
  assert.deepEqual(messages.filter(message=>!allowed.has(message.type)),[],'引导或快捷设置入口不应申请权限、读取日历或启动实时服务');
  assert.deepEqual(await page.evaluate(()=>window.__guideRejections),[]);
}
async function visibleActions(page){
  const geometry=await page.locator('dialog[open]').evaluate(dialog=>{
    const rect=dialog.getBoundingClientRect(),panel=dialog.querySelector('.onboarding-panel').getBoundingClientRect(),heading=dialog.querySelector('.dialog-heading').getBoundingClientRect(),title=dialog.querySelector('#onboarding-step-title').getBoundingClientRect();
    return {dialog:{x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width},viewport:{width:innerWidth,height:innerHeight},panel:{top:panel.top,bottom:panel.bottom},title:{top:title.top,bottom:title.bottom},heading:{top:heading.top,bottom:heading.bottom},actions:[...dialog.querySelectorAll('.onboarding-footer button')].map(button=>{const r=button.getBoundingClientRect();return {name:button.innerText,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}),overflow:dialog.scrollWidth>dialog.clientWidth+1};
  });
  assert.ok(!geometry.overflow);assert.ok(geometry.dialog.x>=0&&geometry.dialog.right<=geometry.viewport.width+1);
  assert.ok(geometry.dialog.y>=0&&geometry.dialog.bottom<=geometry.viewport.height+1);
  assert.ok(geometry.heading.top>=geometry.dialog.y&&geometry.heading.bottom<=geometry.dialog.bottom);
  assert.ok(geometry.title.top>=geometry.panel.top-1&&geometry.title.bottom<=geometry.panel.bottom+1,'当前步骤标题必须完整显示');
  for(const action of geometry.actions){assert.ok(action.y>=geometry.dialog.y&&action.bottom<=geometry.dialog.bottom+1,`${action.name} 必须完整显示`);assert.ok(action.x>=geometry.dialog.x&&action.right<=geometry.dialog.right+1);assert.ok(action.height>=40,'向导操作必须有完整触摸区域');}
  return geometry;
}

try{
  const page=await fresh();
  assert.equal(await page.getByRole('button',{name:'上一步',exact:true}).isDisabled(),true);
  assert.match(await page.locator('.onboarding').innerText(),/JSON/);assert.equal(await page.locator('.onboarding-card').count(),2);pass('首次打开只展示第 1 步，JSON 与手动添加路径清楚');
  await page.getByRole('button',{name:'继续',exact:true}).evaluate(button=>{button.click();button.click();});await page.waitForTimeout(220);
  assert.equal(await page.locator('.onboarding').getAttribute('data-step'),'2');pass('连续点击继续只前进一步，不会跳过引导内容');
  assert.match(await page.locator('.onboarding').innerText(),/选择日期/);assert.match(await page.locator('.onboarding').innerText(),/对应楼栋/);
  await page.getByRole('button',{name:'上一步',exact:true}).click();await page.waitForTimeout(220);assert.equal(await page.locator('.onboarding').getAttribute('data-step'),'1');
  await finalStep(page);assert.match(await page.locator('.onboarding').innerText(),/我到了.*收起/);assert.match(await page.locator('.onboarding').innerText(),/背景毛玻璃/);assert.doesNotMatch(await page.locator('.onboarding').innerText(),/关闭、部分或完全/);pass('步骤可前后切换，日期、导航、实时状态与当前可见外观设置均有说明');
  await assertNoPermission(page);pass('完整引导不申请权限，不读取日历，不启动提醒或导航服务');
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await page.locator('.onboarding').waitFor({state:'hidden'});assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'list');
  const skipped=await stored(page);assert.equal(skipped.onboarded,true);assert.deepEqual(skipped.schedule.courses,[]);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.load-note'));assert.equal(await page.locator('.onboarding').count(),0);pass('任何步骤可跳过，保存完成状态且下次启动不重复展示');

  const importing=await fresh();await finalStep(importing);
  await importing.getByRole('button',{name:'导入第一份课表',exact:true}).evaluate(button=>{button.click();button.click();});await importing.locator('.screen.active[data-screen="import"]').waitFor();
  assert.equal(await importing.locator('.screen.active[data-screen="import"]').count(),1);assert.equal(await importing.locator('.onboarding').count(),0);assert.deepEqual((await stored(importing)).schedule.courses,[]);pass('导入入口直接打开 JSON 导入页，双击不会重复导航或生成课程');
  const manual=await fresh();await finalStep(manual);await manual.getByRole('button',{name:'手动添加课程',exact:true}).click();await manual.getByRole('dialog',{name:'添加课程',exact:true}).waitFor();
  assert.deepEqual((await stored(manual)).schedule.courses,[]);await manual.getByRole('button',{name:'关闭对话框',exact:true}).click();assert.deepEqual((await stored(manual)).schedule.courses,[]);pass('手动入口打开空白课程编辑，取消后不生成示例或空白课程');
  const notifications=await fresh();await finalStep(notifications);await notifications.getByRole('button',{name:'设置提醒',exact:true}).click();await notifications.locator('.screen.active[data-screen="notifications"]').waitFor();await assertNoPermission(notifications);pass('设置提醒快捷入口只打开设置页，保留用户自行启用的选择');
  const appearance=await fresh();await finalStep(appearance);await appearance.getByRole('button',{name:'调整外观',exact:true}).click();await appearance.locator('.screen.active[data-screen="appearance"]').waitFor();await assertNoPermission(appearance);pass('调整外观快捷入口直接打开外观页，不擅自改变效果');

  const retry=await fresh();await retry.evaluate(()=>{window.__guideFailWrite=true;});await retry.getByRole('button',{name:'先逛一逛',exact:true}).click();await retry.getByRole('alert').filter({hasText:'引导状态未能保存'}).waitFor();
  assert.equal(await retry.getByRole('button',{name:'先逛一逛',exact:true}).isEnabled(),true);assert.equal(await retry.locator('.onboarding').getAttribute('aria-busy'),'false');
  await retry.getByRole('button',{name:'先逛一逛',exact:true}).click();await retry.locator('.onboarding').waitFor({state:'hidden'});assert.equal((await stored(retry)).onboarded,true);assert.deepEqual(await retry.evaluate(()=>window.__guideRejections),[]);pass('首次保存失败可重试，不锁死按钮、不产生未处理的 Promise 拒绝');

  // 已有课表重看引导只展示说明，保持课表、教材与个性设置完全不变。
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});const old=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);});old.schedule.courses=[{id:'onboarding-preserved',name:'原有课程',teacher:'陈老师',room:'16栋203号教室',day:1,start:1,end:2,weeks:[1,3,5],color:'sage',notes:'保持原有内容'}];old.books={'onboarding-preserved':{title:'原有教材'}};old.settings.backgroundBlur=7;old.settings.school='原有学校';const tx=db.transaction('state','readwrite');tx.objectStore('state').put(old,'app');await new Promise(resolve=>tx.oncomplete=resolve);db.close();});
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.load-note'));const before=await stored(page);
  await goTab(page,'设置');await page.locator('[data-setting="about"]').click();await page.getByRole('button',{name:/重新.*引导|再次.*引导|使用引导/}).click();await page.locator('.onboarding[data-step="1"]').waitFor();await finalStep(page);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await page.locator('.onboarding').waitFor({state:'hidden'});assert.deepEqual(await stored(page),before);pass('关于页重看从第 1 步开始，跳过后原有课程、教材、学校和背景设置完全保留');

  const compact=await fresh({viewport:{width:320,height:640},colorScheme:'dark',reducedMotion:'reduce'});await compact.evaluate(()=>{document.documentElement.style.setProperty('--ui-scale','1.1');window.dolphinInsets?.(28,24,0,640);});
  const geometry=[];
  for(let step=1;step<=3;step++){await compact.locator(`.onboarding[data-step="${step}"]`).waitFor();geometry.push(await visibleActions(compact));await compact.screenshot({path:`build/evidence/${version}-onboarding-dark-narrow-step-${step}.png`});if(step<3)await next(compact);}
  assert.equal(await compact.locator('dialog[open]').evaluate(dialog=>getComputedStyle(dialog).animationName),'none');pass('320×640、110% 界面与深色下标题及主操作完整显示，减少动画设置生效');
  await compact.locator('.onboarding-panel').evaluate(panel=>{panel.scrollTop=panel.scrollHeight;});assert.ok(await compact.locator('.onboarding-panel').evaluate(panel=>panel.scrollHeight>panel.clientHeight));
  const footerBefore=await compact.locator('.onboarding-footer').boundingBox();await compact.locator('.onboarding-panel').evaluate(panel=>{panel.scrollTop=0;});const footerAfter=await compact.locator('.onboarding-footer').boundingBox();assert.deepEqual(footerBefore,footerAfter);pass('窄屏长内容仅中部滚动，导入、手动、提醒、外观和跳过按钮保持在对话框内');
  await compact.getByRole('button',{name:'上一步',exact:true}).click();await compact.waitForTimeout(220);assert.equal(await compact.locator('.onboarding-panel').evaluate(panel=>panel.scrollTop),0);pass('切换步骤将内容滚回顶部，避免新步骤标题落在旧滚动位置');
  const light=await fresh();await light.screenshot({path:`build/evidence/${version}-onboarding-light-step-1.png`});await finalStep(light);await light.screenshot({path:`build/evidence/${version}-onboarding-light-step-3.png`});
  const loaded=await light.locator('.onboarding .brand-art').evaluate(image=>image.complete&&image.naturalWidth>0);assert.equal(loaded,true);await visibleActions(light);pass('浅色正常屏下品牌图本地加载、引导结构和入口完整');

  if(process.env.TEST_OFFLINE==='1'){
    const offline=await browser.newPage({viewport:{width:320,height:640}}),requests=[];offline.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    const releaseEndpoint='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest';
    await offline.route(releaseEndpoint,route=>route.fulfill({json:{tag_name:`v${version}`,name:'当前正式版',html_url:`https://github.com/tequed232/Dolphin-Calendar/releases/tag/v${version}`,body:'',assets:[]}}));
    await offline.goto(pathToFileURL(path.resolve('web/dist/Dolphin-Calendar-offline.html')).href);await offline.locator('.onboarding[data-step="1"]').waitFor();await finalStep(offline);assert.equal(await offline.locator('.onboarding .brand-art').evaluate(image=>image.complete&&image.naturalWidth>0),true);assert.ok(requests.every(url=>url===releaseEndpoint),JSON.stringify(requests));await offline.getByRole('button',{name:'先逛一逛',exact:true}).click();await offline.locator('.onboarding').waitFor({state:'hidden'});pass('双击离线网页可完成全部引导，品牌与图标本地加载；仅允许官方版本检查');await offline.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-onboarding-results.json`,JSON.stringify({version,checks,errors,compactGeometry:geometry,offlineChecked:process.env.TEST_OFFLINE==='1'},null,2));
}finally{await Promise.allSettled(contexts.map(context=>context.close()));await browser.close();}
