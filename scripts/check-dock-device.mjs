// HISTORICAL: transparent Dock/glass flow. Checkout the relevant old tag to reproduce.
// 1.4.5 uses check-native-navigation.mjs, check-responsive-navigation.mjs and current business CI.
import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {_android} from 'playwright';

const serial=process.env.ANDROID_SERIAL;
assert.match(serial??'',/^emulator-\d+$/,'此检查只操作明确指定的模拟器，不操作手机');
const evidencePrefix=process.env.DEVICE_EVIDENCE_PREFIX??'device';
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:15000});
const devices=await _android.devices({omitDriverInstall:true});
const device=devices.find(d=>d.serial()===serial);assert.ok(device,'未发现指定设备');
try{
  const webview=await device.webView({pkg:'com.dolphin.calendar.debug'});const page=await webview.page();
  const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
  await page.locator('.dock>button').first().click();
  await page.waitForFunction(()=>document.querySelector('.dock').dataset.dragging==='false'&&document.querySelector('.dock-droplet-rim').getBoundingClientRect().width<73&&document.querySelector('.screen.active')?.dataset.screen==='list');
  await mkdir('build/evidence',{recursive:true});await page.screenshot({path:`build/evidence/${evidencePrefix}-home-redesign.png`});
  const geometry=await page.evaluate(()=>{const r=document.querySelector('.dock').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio};});
  const px=v=>Math.round(v*geometry.dpr),startX=px(geometry.x+geometry.width/6),endX=px(geometry.x+geometry.width*5/6),y=px(geometry.y+geometry.height/2);
  const idle=await page.evaluate(()=>({scale:new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.dock-content')).transform).a,rim:document.querySelector('.dock-droplet-rim').getBoundingClientRect().width,sample:document.querySelector('.dock-droplet').getBoundingClientRect().width}));
  const press=spawn('adb',['-s',serial,'shell','input','swipe',String(startX),String(y),String(startX),String(y),'750']);
  const pressDone=new Promise((resolve,reject)=>press.once('exit',code=>code===0?resolve():reject(Error(`ADB 按压退出 ${code}`))));
  await page.waitForFunction(()=>document.querySelector('.dock').dataset.dragging==='true'&&document.querySelector('.dock-droplet-rim').getBoundingClientRect().width>87);
  const held=await page.evaluate(()=>({dragging:document.querySelector('.dock').dataset.dragging,scale:new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.dock-content')).transform).a,rim:document.querySelector('.dock-droplet-rim').getBoundingClientRect().width,sample:document.querySelector('.dock-droplet').getBoundingClientRect().width}));
  await page.screenshot({path:`build/evidence/${evidencePrefix}-dock-pressed.png`});
  await pressDone;await new Promise(resolve=>setTimeout(resolve,550));
  const child=spawn('adb',['-s',serial,'shell','input','swipe',String(startX),String(y),String(endX),String(y),'850']);
  const dragDone=new Promise((resolve,reject)=>child.once('exit',code=>code===0?resolve():reject(Error(`ADB 拖动退出 ${code}`))));
  await page.waitForFunction(()=>document.querySelector('.dock').dataset.dragging==='true'&&Number(document.querySelector('.dock').dataset.preview)>0);
  const during=await page.evaluate(()=>{const dock=document.querySelector('.dock'),bubble=document.querySelector('.dock-droplet'),d=dock.getBoundingClientRect(),b=bubble.getBoundingClientRect();return {dragging:dock.dataset.dragging,preview:dock.dataset.preview,tetherCount:dock.querySelectorAll('.dock-tether').length,inside:b.left>=d.left-1&&b.right<=d.right+1&&b.top>=d.top-1&&b.bottom<=d.bottom+1,bubble:{x:b.x,y:b.y,width:b.width,height:b.height},buttons:[...dock.querySelectorAll(':scope > button')].map(button=>({opacity:getComputedStyle(button).opacity,icon:button.querySelector('svg[data-icon]')?.getAttribute('data-icon')}))};});
  await page.screenshot({path:`build/evidence/${evidencePrefix}-dock-drag.png`});
  await dragDone;await page.waitForFunction(()=>document.querySelector('.dock').dataset.dragging==='false'&&document.querySelector('.screen.active')?.dataset.screen==='settings');
  const after=await page.evaluate(()=>({dragging:document.querySelector('.dock').dataset.dragging,active:document.querySelector('.screen.active')?.dataset.screen}));
  await page.screenshot({path:`build/evidence/${evidencePrefix}-settings-redesign.png`});
  // 帧间隔另做一趟无截图的手势，避免截图本身制造明显超时。
  await page.evaluate(()=>{window.__dockFrames=[];window.__dockSampling=true;let previous=0;const sample=t=>{if(previous)window.__dockFrames.push(t-previous);previous=t;if(window.__dockSampling)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  const returnSwipe=spawn('adb',['-s',serial,'shell','input','swipe',String(endX),String(y),String(startX),String(y),'850']);
  await new Promise((resolve,reject)=>returnSwipe.once('exit',code=>code===0?resolve():reject(Error(`ADB 返回滑动退出 ${code}`))));
  await new Promise(resolve=>setTimeout(resolve,350));
  const frames=(await page.evaluate(()=>{window.__dockSampling=false;return window.__dockFrames;})).filter(v=>v>0).sort((a,b)=>a-b);
  adb('shell','input','tap',String(endX),String(y));await page.waitForFunction(()=>document.querySelector('.screen.active')?.dataset.screen==='settings');
  adb('shell','input','tap',String(startX),String(y));await page.waitForFunction(()=>document.querySelector('.screen.active')?.dataset.screen==='list');
  const report={device:adb('shell','getprop','ro.product.model').trim(),geometry,idle,held,during,after:{...after,samples:frames.length,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1)},tap:'设置 → 首页，ADB 实际点击成功',metric:'无截图手势的 WebView requestAnimationFrame 间隔；不是屏幕实际呈现帧'};
  await writeFile(`build/evidence/${evidencePrefix}-dock-results.json`,JSON.stringify(report,null,2));
  assert.equal(held.dragging,'true');assert.ok(held.scale>1.18,'前景没有放大');assert.ok(held.rim>idle.rim+15,'玻璃轮廓没有展开');assert.ok(Math.abs(held.sample-idle.sample)<1,'背景采样范围被缩放');
  assert.equal(during.dragging,'true');assert.equal(during.tetherCount,0);assert.ok(during.inside,'液滴超出 Dock');assert.equal(during.buttons.length,3);assert.ok(during.buttons.every(button=>button.opacity==='1'));assert.equal(after.dragging,'false');assert.equal(after.active,'settings');
  console.log(JSON.stringify(report,null,2));
}finally{await device.close();adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');}
