import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {_android} from 'playwright';

const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:15000});
const devices=await _android.devices({omitDriverInstall:true});
const device=process.env.ANDROID_SERIAL?devices.find(d=>d.serial()===process.env.ANDROID_SERIAL):devices[0];assert.ok(device);
const page=await (await device.webView({pkg:'com.dolphin.calendar.debug'})).page();
const report={device:adb('shell','getprop','ro.product.model').trim(),directions:[]};
try{
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
 await goTab(page,'列表');
 await page.locator('.screen.active').evaluate(el=>{el.scrollTop=0;});
 for(const direction of ['left','right']){
  await page.locator('.date-strip').evaluate((el,direction)=>{
   const buttons=el.querySelectorAll('button'),stride=buttons[1].offsetLeft-buttons[0].offsetLeft;
   el.scrollLeft=(direction==='left'?145:32)*stride;
  },direction);await page.waitForTimeout(200);
  const first=await page.locator('.date-item').first().getAttribute('aria-label');
  const geometry=await page.locator('.date-strip').evaluate(el=>{
   window.__dateTrace=[];
   const record=()=>{const r=el.getBoundingClientRect(),button=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.date-item');const numbers=button?.getAttribute('aria-label')?.match(/\d+/g);if(numbers)window.__dateTrace.push({day:Date.UTC(+numbers[0],+numbers[1]-1,+numbers[2])/86400000,first:el.querySelector('button').getAttribute('aria-label'),left:el.scrollLeft});};
   el.addEventListener('scroll',record);window.__stopDateTrace=()=>el.removeEventListener('scroll',record);record();
   const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio};
  });
  const px=x=>String(Math.round(x*geometry.dpr)),y=px(geometry.y+geometry.height/2);
  const left=px(geometry.x+25),right=px(geometry.x+geometry.width-25);
  adb('shell','input','swipe',direction==='left'?right:left,y,direction==='left'?left:right,y,'300');
  await page.waitForFunction(first=>document.querySelector('.date-item')?.getAttribute('aria-label')!==first,first,{timeout:6000});await page.waitForTimeout(200);
  const trace=await page.evaluate(()=>{window.__stopDateTrace();return window.__dateTrace;});
  report.directions.push({direction,samples:trace.length,trace});
  assert.ok(trace.length>3,'ADB 手势没有连续滚动事件');
  assert.notEqual(await page.locator('.date-item').first().getAttribute('aria-label'),first,'手势没有跨越补充日期边界');
  for(let i=1;i<trace.length;i++)if(trace[i].first!==trace[i-1].first)assert.ok(Math.abs(trace[i].day-trace[i-1].day)<=1,'补充日期时出现大幅视觉跳变');
 }
 const bounds=await page.locator('.date-strip').boundingBox();const selected=await page.locator('.date-strip').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.date-item')?.getAttribute('aria-label');});
 const dpr=await page.evaluate(()=>devicePixelRatio);
 adb('shell','input','tap',String(Math.round((bounds.x+bounds.width/2)*dpr)),String(Math.round((bounds.y+bounds.height/2)*dpr)));
 await page.waitForTimeout(200);assert.equal(await page.locator('.date-item.selected').getAttribute('aria-label'),selected);
 report.tapSelected=selected;report.completed=true;
 await page.locator('.week-controls').getByRole('button',{name:'回到今天',exact:true}).click();
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/1.2.2-android-dates.json',JSON.stringify(report,null,2));
 console.log('PASS ADB 左右手势跨过日期窗口边界，无大幅跳变，并实际点选日期');
}finally{await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/1.2.2-android-dates.json',JSON.stringify(report,null,2));await device.close();}
