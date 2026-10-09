import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
const touch=await context.newCDPSession(page),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const picker=()=>page.locator('dialog[open]').filter({has:page.locator('.calendar-picker')});
const month=()=>picker().locator('.calendar-month').innerText();
const slide=()=>picker().locator('.calendar-viewport');
async function check(name,action){await action();checks.push(name);console.log('PASS '+name);}
async function settle(){await page.waitForTimeout(460);}
async function open(){await page.getByRole('button',{name:'选择日期',exact:true}).click();await picker().waitFor();await settle();}
async function jump(year,monthIndex){
  if(await picker().locator('.calendar-month').getAttribute('aria-expanded')!=='true')await picker().locator('.calendar-month').click();
  await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).fill(String(year));
  await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).press('Enter');
  await picker().getByRole('button',{name:'月份',exact:true}).click();await picker().getByRole('option',{name:`${monthIndex} 月`,exact:true}).click();
  await picker().locator('.calendar-month').click();await settle();
}
async function drag({x=-.6,y=0,cancel=false,slow=false,follow=false,region='month'}={}){
  const target=region==='year'?picker().locator('.calendar-year-swipe'):slide(),track=target.locator(region==='year'?'.calendar-year-track':'.calendar-track');
  await target.scrollIntoViewIfNeeded();const box=await target.boundingBox(),startX=box.x+box.width*(x<0?.8:.2),startY=box.y+box.height*.5;
  const before=await track.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:startY}]});
  for(let i=1;i<=8;i++){
    await page.waitForTimeout(slow?70:18);
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+box.width*x*i/8,y:startY+y*i/8}]});
    if(follow&&i===4){
      assert.equal(await target.getAttribute('data-dragging'),'true','水平触摸应进入跟手拖动');
      const moved=await track.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      assert.ok(Math.abs(moved-before)>20,`日期或年份面板应跟随手指移动，而不是仅在松手时替换：${moved-before}`);
      if(region==='year')assert.equal(await target.locator('.calendar-year-slide[aria-hidden=true]').count(),2);else assert.equal(await picker().locator('.calendar-preview-grid').count(),2);
    }
  }
  await touch.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await settle();
}
async function storedSchedule(){return page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const schedule=await new Promise(resolve=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result.schedule);});db.close();return schedule;});}
async function changeAppearance(scale,mode='dark'){
  await picker().getByRole('button',{name:'关闭对话框',exact:true}).click();await page.waitForTimeout(300);
  await page.evaluate(async({scale,mode})=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const value=await new Promise(resolve=>{const request=store.get('app');request.onsuccess=()=>resolve(request.result);});value.settings.scale=scale;value.settings.mode=mode;store.put(value,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},{scale,mode});
  await page.reload();await page.getByRole('button',{name:'选择日期',exact:true}).waitFor();await open();
}
try{
  await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date(2026,9,2,9));
  await page.goto(url);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await page.waitForTimeout(300);
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const value=await new Promise(resolve=>{const request=store.get('app');request.onsuccess=()=>resolve(request.result);});value.schedule.term={name:'月历手势测试',startDate:'2026-09-28',weeks:20};value.schedule.courses=[{id:'swipe-friday',name:'交互验证课程',teacher:'测试教师',room:'测试楼101',day:5,start:3,end:4,weeks:[1,3],color:'sage',notes:''}];value.settings.mode='light';value.settings.scale=1;store.put(value,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
  await page.reload();await page.getByRole('button',{name:'选择日期',exact:true}).waitFor();const original=await storedSchedule();await open();
  await check('真实触摸拖动跟手预览，下个月与上个月连续切换，保持选择日期和有课标记',async()=>{
    assert.match(await month(),/2026年10月/);assert.equal(await picker().locator('.calendar-day').count(),42);
    await drag({follow:true});assert.match(await month(),/2026年11月/);await drag({x:.6,follow:true});assert.match(await month(),/2026年10月/);
    assert.equal(await picker().getByRole('button',{name:'2026-10-02，1 门课程',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await picker().getByRole('button',{name:'2026-10-16，1 门课程',exact:true}).locator('.has-course').count(),1);
    assert.equal(await picker().locator('.calendar-preview-grid button').count(),0,'相邻月预览不应产生重复焦点或日期按钮');assert.equal(await picker().locator('.calendar-day').count(),42);
  });
  await check('12月到1月触摸跨年和反向返回，连续按钮切换不会丢掉月份',async()=>{
    await jump(2026,12);await drag();assert.match(await month(),/2027年1月/);await drag({x:.6});assert.match(await month(),/2026年12月/);
    await jump(2026,10);for(let i=0;i<3;i++)await picker().getByRole('button',{name:'下个月',exact:true}).click();assert.match(await month(),/2027年1月/);await settle();
  });
  await check('纵向滚动、短距离慢拖与系统取消触摸均不误切月份或选择日期',async()=>{
    await jump(2026,10);await drag({x:.02,y:70});assert.match(await month(),/2026年10月/);
    await drag({x:-.1,slow:true});assert.match(await month(),/2026年10月/);
    await drag({x:-.65,cancel:true,follow:true});assert.match(await month(),/2026年10月/);
    assert.equal(await picker().getByRole('button',{name:'2026-10-02，1 门课程',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await slide().getAttribute('data-dragging'),null);assert.deepEqual(await storedSchedule(),original);
  });
  await check('1900年1月与9999年12月边界禁用超界按钮，触摸回弹不进入无效年月',async()=>{
    await jump(1900,1);assert.equal(await picker().getByRole('button',{name:'上个月',exact:true}).isDisabled(),true);await drag({x:.6});assert.match(await month(),/1900年1月/);
    assert.equal(await picker().getByRole('button',{name:'1900-01-01，无课程',exact:true}).isEnabled(),true);
    await jump(9999,12);assert.equal(await picker().getByRole('button',{name:'下个月',exact:true}).isDisabled(),true);await drag();assert.match(await month(),/9999年12月/);assert.equal(await picker().getByRole('button',{name:'10000-01-01，无课程',exact:true}).isDisabled(),true);
  });
  await check('年月快速上一年下一年、键盘月份及Shift跨年，输入无效年份安全恢复',async()=>{
    await jump(2026,10);await picker().locator('.calendar-month').click();await picker().getByRole('button',{name:'下一年',exact:true}).click();assert.match(await month(),/2027年10月/);await picker().getByRole('button',{name:'上一年',exact:true}).click();assert.match(await month(),/2026年10月/);
    await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).fill('0');await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).press('Enter');assert.equal(await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).inputValue(),'2026');
    await picker().locator('.calendar-month').click();await slide().focus();await page.keyboard.press('ArrowRight');assert.match(await month(),/2026年11月/);await page.keyboard.press('Shift+ArrowLeft');assert.match(await month(),/2025年11月/);
  });
  await check('年月展开区真实左右触摸跟手切年份，年份输入及月份保持同步',async()=>{
    await jump(2026,10);await picker().locator('.calendar-month').click();await settle();
    await drag({region:'year',follow:true});assert.match(await month(),/2027年10月/);assert.equal(await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).inputValue(),'2027');
    await drag({region:'year',x:.6,follow:true});assert.match(await month(),/2026年10月/);assert.equal(await picker().getByRole('spinbutton',{name:'日历年份',exact:true}).inputValue(),'2026');
    const years=picker().getByRole('group',{name:'滑动切换年份',exact:true});await years.focus();await page.keyboard.press('ArrowRight');assert.match(await month(),/2027年10月/);await page.keyboard.press('ArrowLeft');assert.match(await month(),/2026年10月/);await settle();
    await page.screenshot({path:`build/evidence/${version}-calendar-year-swipe.png`});assert.deepEqual(await storedSchedule(),original);
  });
  await check('年份区纵向滚动、短拖和取消不翻年，输入框操作与年份手势隔离',async()=>{
    await drag({region:'year',x:.02,y:60});assert.match(await month(),/2026年10月/);await drag({region:'year',x:-.1,slow:true});assert.match(await month(),/2026年10月/);await drag({region:'year',cancel:true,follow:true});assert.match(await month(),/2026年10月/);
    const field=picker().getByRole('spinbutton',{name:'日历年份',exact:true});await field.fill('2030');await field.press('Enter');assert.match(await month(),/2030年10月/);await field.scrollIntoViewIfNeeded();const box=await field.boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.25,y:box.y+box.height*.5}]});await page.waitForTimeout(30);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.6,y:box.y+box.height*.5}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();assert.match(await month(),/2030年10月/);assert.equal(await field.inputValue(),'2030');assert.deepEqual(await storedSchedule(),original);
  });
  await check('年份触摸在1900与9999边界回弹，不显示超界可选年份',async()=>{
    await jump(1900,1);await picker().locator('.calendar-month').click();await settle();await drag({region:'year',x:.6});assert.match(await month(),/1900年1月/);assert.equal(await picker().getByRole('button',{name:'上一年',exact:true}).isDisabled(),true);assert.equal(await picker().locator('.calendar-year-slide').first().locator('strong').innerText(),'—');
    await jump(9999,12);await picker().locator('.calendar-month').click();await settle();await drag({region:'year'});assert.match(await month(),/9999年12月/);assert.equal(await picker().getByRole('button',{name:'下一年',exact:true}).isDisabled(),true);assert.equal(await picker().locator('.calendar-year-slide').last().locator('strong').innerText(),'—');
  });
  await check('减弱动态效果仍可触摸切换，月历不保留过渡动画',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});await jump(2026,10);await drag();assert.match(await month(),/2026年11月/);
    const durations=await slide().locator('.calendar-track').evaluate(el=>getComputedStyle(el).transitionDuration.split(',').map(Number.parseFloat));assert.ok(durations.every(duration=>duration<=.001),`减弱动态效果的过渡应立即结束：${durations}`);
    await picker().locator('.calendar-month').click();await drag({region:'year'});assert.match(await month(),/2027年11月/);const yearDurations=await picker().locator('.calendar-year-track').evaluate(el=>getComputedStyle(el).transitionDuration.split(',').map(Number.parseFloat));assert.ok(yearDurations.every(duration=>duration<=.001));await page.emulateMedia({reducedMotion:'no-preference'});await picker().locator('.calendar-month').click();
  });
  await check('320px窄屏110%字体下年月与日期不溢出、日期仍可点选',async()=>{
    await changeAppearance(1.1);await page.setViewportSize({width:320,height:760});await settle();
    const layout=await picker().evaluate(dialog=>{const viewport=dialog.querySelector('.calendar-viewport').getBoundingClientRect(),days=[...dialog.querySelectorAll('.calendar-day')].map(day=>day.getBoundingClientRect());return {left:viewport.left,right:viewport.right,minWidth:Math.min(...days.map(day=>day.width)),overflow:dialog.querySelector('.calendar-grid').scrollWidth>dialog.querySelector('.calendar-grid').clientWidth+1};});
    assert.ok(layout.left>=0&&layout.right<=321,JSON.stringify(layout));assert.ok(layout.minWidth>=30,JSON.stringify(layout));assert.equal(layout.overflow,false);
    await picker().locator('.calendar-month').click();const field=picker().getByRole('spinbutton',{name:'日历年份',exact:true});assert.equal(await field.inputValue(),'2026');const yearBox=await field.boundingBox();assert.ok(yearBox.width>=44,'年份输入应有足够操作宽度');await drag({region:'year',follow:true});assert.match(await month(),/2027年10月/);await drag({region:'year',x:.6});assert.match(await month(),/2026年10月/);await picker().locator('.calendar-month').click();
    await page.screenshot({path:`build/evidence/${version}-calendar-swipe-portrait.png`});await picker().getByRole('button',{name:'2026-10-16，1 门课程',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);assert.match(await page.locator('.date-item.selected').getAttribute('aria-label'),/2026年10月16日/);await open();
  });
  await check('844x390横屏110%字体月历两栏完整，标题与底部操作不重叠且仍支持触摸跨月',async()=>{
    await page.setViewportSize({width:844,height:390});await settle();
    const layout=await picker().evaluate(dialog=>{const box=dialog.getBoundingClientRect(),controls=dialog.querySelector('.calendar-controls').getBoundingClientRect(),dates=dialog.querySelector('.calendar-dates').getBoundingClientRect(),footer=dialog.querySelector('.calendar-footer').getBoundingClientRect(),heading=dialog.querySelector('.dialog-heading').getBoundingClientRect(),style=getComputedStyle(dialog);return {dialog:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},controlsRight:controls.right,datesLeft:dates.left,datesTop:dates.top,headingBottom:heading.bottom,footerBottom:footer.bottom,viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport?.height,visualScale:visualViewport?.scale},style:{maxHeight:style.maxHeight,height:style.height,zoom:style.zoom},root:getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')};});
    assert.ok(layout.dialog.left>=0&&layout.dialog.right<=845&&layout.dialog.top>=0&&layout.dialog.bottom<=391,JSON.stringify(layout));assert.ok(layout.controlsRight<layout.datesLeft,JSON.stringify(layout));assert.ok(layout.datesTop>=layout.headingBottom,JSON.stringify(layout));assert.ok(layout.footerBottom<=390,JSON.stringify(layout));
    await drag();assert.match(await month(),/2026年11月/);await page.screenshot({path:`build/evidence/${version}-calendar-swipe-landscape.png`});await picker().locator('.calendar-month').click();await drag({region:'year',follow:true});assert.match(await month(),/2027年11月/);await picker().locator('.calendar-month').scrollIntoViewIfNeeded();await picker().locator('.calendar-month').click();await settle();
    await picker().getByRole('button',{name:'回到今天',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(await storedSchedule(),original);
  });
  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-calendar-swipe-results.json`,JSON.stringify({version,completed:true,checks,errors,scope:'隔离浏览器与虚构课程；Chromium真实触摸输入，未操作用户课表'},null,2));
}finally{await browser.close();}
