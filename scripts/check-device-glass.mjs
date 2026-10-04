import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:15000});
const app='com.dolphin.calendar.debug';
if(/showing=true/.test(adb('shell','dumpsys','window','policy').split('KeyguardServiceDelegate')[1]??''))throw Error('手机尚未解锁，不能采集有效交互帧');
const pid=adb('shell','pidof',app).trim();assert.ok(pid,'请先启动 Dolphin 调试包');
adb('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
const b=await chromium.connectOverCDP('http://127.0.0.1:9223');const p=b.contexts()[0].pages().find(p=>p.url().includes('appassets.androidplatform.net'));
assert.ok(p);const report={at:new Date().toISOString(),device:adb('shell','getprop','ro.product.model').trim(),kind:'WebView rAF 间隔，非系统呈现帧',origins:[],runs:[]};
await mkdir('build/evidence',{recursive:true});
const saved=await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result??null);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
await writeFile('build/device-glass-backup.json',JSON.stringify(saved));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(const y of [650,1400,2100]){
  await p.getByRole('button',{name:'设置',exact:true}).click();await p.locator('[data-setting="appearance"]').click();await pause(400);
  await p.evaluate(()=>{window.__origin=[];const original=window.dolphinBack;window.dolphinBack=(phase,progress,x,y)=>{original(phase,progress,x,y);if(phase==='start'){const screen=document.querySelector('.screen.active');const host=document.querySelector('.app-shell').getBoundingClientRect();window.__origin.push({x,y,origin:screen.style.transformOrigin,expected:[Math.max(0,Math.min(host.width,x*innerWidth-host.left)),Math.max(0,Math.min(host.height,y*innerHeight-host.top))]});}};});
  await new Promise((resolve,reject)=>{const child=spawn('adb',['shell','input','swipe','8',String(y),'900',String(y),'550']);child.on('exit',code=>code===0?resolve():reject(Error('swipe')));});await pause(300);
  const origins=await p.evaluate(()=>window.__origin);assert.ok(origins.length,`高度 ${y} 没有触点回调`);
  const point=origins[0],actual=point.origin.split(' ').map(parseFloat);for(let i=0;i<2;i++)assert.ok(Math.abs(actual[i]-point.expected[i])<2,JSON.stringify(point));
  report.origins.push({physicalY:y,...point});
  // 每次重载清掉测试包装函数，业务数据保持不变。
  await p.reload();
 }
 await p.getByRole('button',{name:'设置',exact:true}).click();await p.locator('[data-setting="appearance"]').click();await pause(400);
 for(const mode of ['off','auto','full']){
  const enabled=mode!=='off';
  if(await p.locator('#liquid-glass').isChecked()!==enabled){await p.locator('#liquid-glass').click();await p.waitForFunction(value=>document.querySelector('#liquid-glass').checked===value,enabled);}
  await p.getByLabel('性能模式',{exact:true}).selectOption(mode==='full'?'high':'auto');
  await pause(450);
  // 使用真正的 ADB 触摸滚动；采样不参与业务动画写入。
  await p.evaluate(()=>{window.__frames=[];window.__sampling=true;let last=0;const frame=t=>{if(last)window.__frames.push(t-last);last=t;if(window.__sampling)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  for(let i=0;i<4;i++)await new Promise((resolve,reject)=>{const child=spawn('adb',['shell','input','swipe','650',i%2?'800':'2100','650',i%2?'2100':'800','700']);child.on('exit',code=>code===0?resolve():reject(Error('scroll')));});
  const data=await p.evaluate(()=>{window.__sampling=false;return {frames:window.__frames,performance:document.documentElement.dataset.performance,glass:document.documentElement.dataset.glass};});
  const f=data.frames.filter(v=>v>0).sort((a,b)=>a-b);report.runs.push({mode,samples:f.length,median:f[Math.floor(f.length*.5)],p95:f[Math.floor(f.length*.95)],max:f.at(-1),over12_5:f.filter(v=>v>12.5).length,over50:f.filter(v=>v>50).length,effective:data.performance});
 }
 await p.screenshot({path:'build/evidence/device-glass-appearance.png'});
 console.log(JSON.stringify(report,null,2));
}finally{
 await p.evaluate(value=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('state','readwrite');if(value)t.objectStore('state').put(value,'app');else t.objectStore('state').delete('app');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};}),saved);
 await p.reload();report.originalDataRestored=true;await writeFile('build/evidence/device-glass-results.json',JSON.stringify(report,null,2));await b.close();
}
