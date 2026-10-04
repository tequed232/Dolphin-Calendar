import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
let page=await context.newPage();
const checks=[],errors=[],geometry=[];
const watch=page=>page.on('pageerror',error=>errors.push(error.message));
watch(page);
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const active=()=>page.locator('.screen.active');
await mkdir('build/evidence',{recursive:true});

async function stored(){return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const value=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return value;
});}
async function ready(){await page.locator('.load-note').waitFor({state:'hidden'});await active().waitFor();}
async function settled(){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(Number(animation.effect?.getTiming().iterations))).map(animation=>animation.finished.catch(()=>{})));});}
async function seed(settings){
  await page.evaluate(async settings=>{
    const {initialData,sampleSchedule}=await import('/src/lib/model.ts'),data=initialData();
    data.onboarded=true;data.schedule=sampleSchedule();data.schedule.term.startDate='2026-09-28';
    data.books={'大学英语':{title:'保留的英语教材',publisher:'本地测试',edition:'第一版',text:'原有教材内容',source:'manual'}};
    data.background={url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=',name:'保留背景',width:1,height:1,sourceWidth:1,sourceHeight:1};
    data.holidays=[{date:'2026-10-01',kind:'rest',title:'保留休假',source:'本地日历'}];data.holidayCalendarIds=['local'];data.holidaySourceNames=['本地日历'];data.holidayRanges=[{from:'2026-10-01',to:'2026-10-07',calendarIds:['local']}];
    Object.assign(data.settings,{mode:'light',performance:'high',school:'原有学校',backgroundEnabled:true},settings);
    if(settings.glassMode===null)delete data.settings.glassMode;
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },settings);
  const before=await stored();await page.reload();await ready();return before;
}
async function appearance(){await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="appearance"]').click();await active().filter({has:page.getByRole('button',{name:'深浅模式',exact:true})}).waitFor();await settled();}
async function hiddenMode(){
  assert.equal(await page.getByRole('button',{name:'液态玻璃模式',exact:true}).count(),0);
  assert.equal(await page.locator('.glass-mode-description').count(),0);
  assert.doesNotMatch(await active().innerText(),/关闭 · 纯色界面|部分 · 底栏|完全 · 全界面|让卡片、按钮与弹窗也使用玻璃质感/);
}
async function solid(selector){
  const surfaces=page.locator(selector);assert.ok(await surfaces.count(),`${selector} 必须存在`);
  for(const filter of await surfaces.evaluateAll(elements=>elements.map(el=>getComputedStyle(el).backdropFilter)))assert.equal(filter,'none',`${selector} 仍用了全界面玻璃`);
}
async function nextGuide(){await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForTimeout(220);}
async function guideGeometry(){return page.locator('dialog[open]').evaluate(dialog=>{
  const r=dialog.getBoundingClientRect(),panel=dialog.querySelector('.onboarding-panel').getBoundingClientRect(),title=dialog.querySelector('#onboarding-step-title').getBoundingClientRect();
  return {step:Number(dialog.querySelector('.onboarding').dataset.step),width:innerWidth,height:innerHeight,dialog:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},panel:{top:panel.top,bottom:panel.bottom},title:{top:title.top,bottom:title.bottom},overflow:dialog.scrollWidth-dialog.clientWidth,actions:[...dialog.querySelectorAll('.onboarding-footer button')].map(button=>{const b=button.getBoundingClientRect();return {name:button.innerText,x:b.x,y:b.y,right:b.right,bottom:b.bottom,height:b.height};})};
});}

try{
  await page.clock.setFixedTime(new Date(2026,8,29,9));await page.goto(url);await ready();
  const defaults=await seed({glass:true,glassMode:'partial'});await appearance();await hiddenMode();
  for(const name of ['底栏边缘光泽','底栏散射','底栏扭曲','性能模式'])assert.ok(await page.getByRole('button',{name,exact:true}).isVisible());
  assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'partial');await page.locator('.dock[data-droplet-ready=true]').waitFor();
  assert.match(await page.locator('#glass-droplet feImage').first().getAttribute('href'),/^data:image\/png/);assert.deepEqual(await stored(),defaults);
  await active().evaluate(el=>el.scrollTop=el.scrollHeight);await settled();await page.screenshot({path:`build/evidence/${version}-master-appearance.png`});
  pass('稳定版外观隐藏三档选择与相关说明，保留底栏参数和真实透镜');

  for(const settings of [{glass:false,glassMode:null},{glass:false,glassMode:'off'}]){
    const before=await seed(settings);assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'off');assert.equal(await page.locator('html').getAttribute('data-glass'),'false');
    assert.equal(await page.locator('.dock').evaluate(el=>getComputedStyle(el,'::before').backdropFilter),'none');
    await appearance();await hiddenMode();assert.equal(await page.getByRole('button',{name:'底栏边缘光泽',exact:true}).count(),0);assert.deepEqual(await stored(),before);
    await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill('大学英语');assert.ok(await page.locator('.result-card').count());
    await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'off');assert.deepEqual(await stored(),before);
  }
  pass('旧版 glass=false 与已保存 off 均保持关闭，业务可用且重启不改数据');

  const full=await seed({glass:true,glassMode:'full'});
  assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'partial');await solid('.date-panel,.course-card');
  await page.locator('.dock[data-droplet-ready=true]').waitFor();assert.match(await page.locator('#glass-droplet feImage').first().getAttribute('href'),/^data:image\/png/);
  await page.getByRole('button',{name:'选择日期',exact:true}).click();await solid('dialog[open]');await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill('大学英语');await solid('.search-results');
  await appearance();await hiddenMode();await solid('.screen.active md-card,.screen.active .sub-header');assert.deepEqual(await stored(),full);
  await page.screenshot({path:`build/evidence/${version}-master-saved-full.png`});
  pass('已保存 full 实际仅渲染底栏透镜，主页、搜索、月历与设置使用稳定材质');

  await page.getByRole('button',{name:'底栏散射',exact:true}).click();await page.getByRole('option',{name:'弥散 · 背景深度模糊',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--glass-blur')==='2.5px');
  const adjusted={...full,settings:{...full.settings,scattering:2}};assert.deepEqual(await stored(),adjusted);assert.equal((await stored()).settings.glassMode,'full');
  await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'partial');assert.deepEqual(await stored(),adjusted);
  await page.close();page=await context.newPage();watch(page);await page.clock.setFixedTime(new Date(2026,8,29,9));await page.goto(url);await ready();
  assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'partial');assert.deepEqual(await stored(),adjusted);await appearance();await hiddenMode();
  pass('调整底栏参数后仍保留原 full 偏好，刷新与重新打开页面保留课表、教材、背景和休假');

  await seed({glass:true,glassMode:'full',mode:'dark',scale:1.1});await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="about"]').click();await page.getByRole('button',{name:/重新.*引导|再次.*引导|使用引导/}).click();
  const guideBefore=await stored();await page.evaluate(()=>window.dolphinInsets(28,24,0,640));
  for(let step=1;step<=3;step++){
    await page.locator(`.onboarding[data-step="${step}"]`).waitFor();const sample=await guideGeometry();geometry.push(sample);
    assert.ok(sample.overflow<=1);assert.ok(sample.dialog.x>=0&&sample.dialog.right<=sample.width+1);assert.ok(sample.dialog.y>=0&&sample.dialog.bottom<=sample.height+1);
    assert.ok(sample.title.top>=sample.panel.top-1&&sample.title.bottom<=sample.panel.bottom+1);
    for(const action of sample.actions){assert.ok(action.x>=sample.dialog.x&&action.right<=sample.dialog.right+1);assert.ok(action.y>=sample.dialog.y&&action.bottom<=sample.dialog.bottom+1,`${action.name} 必须完整显示`);assert.ok(action.height>=40);}
    assert.doesNotMatch(await page.locator('.onboarding').innerText(),/关闭、部分或完全|全界面/);if(step<3)await nextGuide();
  }
  assert.match(await page.locator('.onboarding').innerText(),/背景毛玻璃与底栏质感/);assert.equal(await page.locator('dialog[open]').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('.onboarding-panel').evaluate(panel=>panel.scrollTop=panel.scrollHeight);await settled();await page.screenshot({path:`build/evidence/${version}-master-guide-narrow.png`});await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await page.locator('.onboarding').waitFor({state:'hidden'});assert.deepEqual(await stored(),guideBefore);
  pass('320×640、110% 深色窄屏引导描述可见设置，全部主操作完整且重看不改原数据');

  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-master-glass-results.json`,JSON.stringify({version,url,checks,errors,compactGeometry:geometry},null,2));
}finally{await context.close();await browser.close();}
