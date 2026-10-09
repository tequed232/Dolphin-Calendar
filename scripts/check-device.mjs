// HISTORICAL: transparent Dock/glass flow. Checkout the relevant old tag to reproduce.
// 1.4.5 uses check-native-navigation.mjs, check-responsive-navigation.mjs and current business CI.
import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:15000});
const app='com.dolphin.calendar.debug';
const pid=adb('shell','pidof',app).trim();if(!pid)throw new Error('请先启动调试包');
adb('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
const page=browser.contexts()[0].pages().find(p=>p.url().includes('appassets.androidplatform.net'));
if(!page)throw new Error('找不到 Dolphin WebView');
await mkdir('build/evidence',{recursive:true});
const report={device:adb('shell','getprop','ro.product.model').trim(),sdk:adb('shell','getprop','ro.build.version.sdk').trim(),checks:[],performance:null};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=(name)=>{report.checks.push(name);console.log('PASS '+name);};
let saved;
try{
  // 保存调试包现有业务数据；任何测试结束都恢复，不清库、不碰旧应用。
  saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result??null);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
  const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
  await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();
  const now=new Date(),day=(now.getDay()+6)%7+1,first=new Date(now);first.setDate(now.getDate()-day+1);
  const date=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const value={term:{name:'真机自动化验证',startDate:date(first),weeks:20},courses:[{name:'海豚真机测试课',teacher:'测试教师',room:'测试楼 A101',day,start:1,end:2,weeks:[1,2,3],color:'sage'}]};
  await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(value));await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.locator('.screen.active .course-card').waitFor();pass('真机 JSON 导入 → IndexedDB → 主页课程');
  const insets=await page.evaluate(()=>({top:getComputedStyle(document.documentElement).getPropertyValue('--native-top'),bottom:getComputedStyle(document.documentElement).getPropertyValue('--native-bottom'),dock:document.querySelector('.dock').getBoundingClientRect().bottom,height:innerHeight}));
  assert.ok(parseFloat(insets.top)>0);assert.ok(parseFloat(insets.bottom)>0);assert.ok(insets.dock<insets.height);report.insets=insets;pass('原生上/下安全区注入并避开手势条');
  await page.screenshot({path:'build/evidence/device-home.png'});
  await page.locator('.screen.active .course-card').click();await page.getByRole('button',{name:'手动填写',exact:true}).click();await page.locator('dialog[open]').waitFor();
  adb('shell','input','keyevent','4');await sleep(450);assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.course-sheet').count(),1);pass('返回键只关闭最上层教材对话框');
  adb('shell','input','keyevent','4');await sleep(450);assert.equal(await page.locator('.course-sheet').count(),0);pass('再次返回关闭详情，主页保留');
  await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();await sleep(450);
  const before=await page.evaluate(()=>window.dolphinMetrics.backCallbacks);
  await page.evaluate(()=>{window.__frameTimes=[];let prev=performance.now();window.__sampling=true;function frame(t){if(document.documentElement.classList.contains('gesturing'))window.__frameTimes.push(t-prev);prev=t;if(window.__sampling)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  await new Promise((resolve,reject)=>{const child=spawn('adb',['shell','input','swipe','8','1400','800','1400','500']);child.on('exit',code=>code===0?resolve():reject(new Error('ADB swipe failed')));});
  await sleep(450);
  const metrics=await page.evaluate(()=>{window.__sampling=false;return {frames:window.__frameTimes,callbacks:window.dolphinMetrics.backCallbacks,screen:document.querySelector('.screen.active').dataset.screen};});
  assert.ok(metrics.callbacks>before+2,`手势没有连续进度 ${metrics.callbacks-before}`);assert.equal(metrics.screen,'settings');pass('原生左边缘接管，连续进度与提交只退一层');
  const frames=metrics.frames.filter(v=>v>0).sort((a,b)=>a-b);report.performance={samples:frames.length,callbacks:metrics.callbacks-before,median:frames[Math.floor(frames.length*.5)]??null,p95:frames[Math.floor(frames.length*.95)]??null,max:frames.at(-1)??null,over50:frames.filter(v=>v>50).length};console.log(JSON.stringify(report.performance));
  await page.locator('[data-setting="appearance"]').click();await page.getByRole('button',{name:'屏幕安全区',exact:true}).click();await page.locator('#top-auto').uncheck();await page.locator('input[type=range]').first().fill('50');await sleep(100);assert.match(await page.locator('html').evaluate(e=>e.style.getPropertyValue('--safe-top')),/50px/);pass('外观中的手动安全区设置立即生效');
  await page.getByRole('button',{name:'返回上一页',exact:true}).click();await sleep(400);await page.screenshot({path:'build/evidence/device-settings.png'});
  report.completed=true;
}finally{
  if(saved!==undefined){await page.evaluate(value=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('state','readwrite');if(value)t.objectStore('state').put(value,'app');else t.objectStore('state').delete('app');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);}),saved);await page.reload();report.originalDataRestored=true;}
  await writeFile('build/evidence/device-results.json',JSON.stringify(report,null,2));await browser.close();
}
