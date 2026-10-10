import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1304,height:892},hasTouch:true}),page=await context.newPage();
const touch=await context.newCDPSession(page),checks=[],errors=[],geometry=[];
page.on('pageerror',error=>errors.push(error.message));
const home=()=>page.locator('.screen.active[data-screen="list"]'),strip=()=>home().locator('.date-strip'),selected=()=>strip().locator('.date-item.selected');
async function check(name,action){await action();checks.push(name);console.log('PASS '+name);}
async function seed(scale=1){
  await page.evaluate(async scale=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const data=await new Promise(resolve=>{const request=store.get('app');request.onsuccess=()=>resolve(request.result);});data.onboarded=true;data.schedule.term={name:'日期条布局验证',startDate:'2026-09-28',weeks:20};data.schedule.courses=Array.from({length:7},(_,i)=>({id:`spacing-day-${i+1}`,name:`验证课程 ${i+1}`,teacher:'测试教师',room:'测试楼101',day:i+1,start:1,end:2,weeks:Array.from({length:20},(_,w)=>w+1),color:'sage',notes:''}));Object.assign(data.settings,{scale,mode:'light',timetableMode:'list',showWeekend:true,holidayMarkers:false});store.put(data,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},scale);
  await page.reload();await home().waitFor();await selected().waitFor();await home().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(360);
}
async function schedule(){return page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const data=await new Promise(resolve=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result);});db.close();return data.schedule;});}
async function homeFocus(){return home().locator('.home-inner').evaluate(el=>({date:el.dataset.focusDate,section:el.dataset.focusSection,course:el.dataset.focusCourse}));}
async function visibleSelection(){await page.waitForFunction(()=>{const strip=document.querySelector('.screen.active .date-strip'),picked=strip?.querySelector('.date-item.selected');if(!strip||!picked)return false;const viewport=strip.getBoundingClientRect(),card=picked.getBoundingClientRect();return card.left>=viewport.left-1&&card.right<=viewport.right+1;});}
async function metrics(){return home().locator('.date-panel').evaluate(panel=>{
  const node=panel.querySelector('.date-strip'),items=[...node.querySelectorAll('.date-item')],picked=node.querySelector('.selected'),viewport=node.getBoundingClientRect(),card=picked.getBoundingClientRect(),first=items[0].getBoundingClientRect(),next=items[1].getBoundingClientRect(),style=getComputedStyle(picked),cssWidth=Number.parseFloat(style.width),scale=card.width/cssWidth;
  const gap=Number.parseFloat(getComputedStyle(node).gap);return {panelCssWidth:Number.parseFloat(getComputedStyle(panel).width),stripCssWidth:node.clientWidth,selectedCssWidth:cssWidth,selectedPhysicalWidth:card.width,centerDistanceCss:(next.left-first.left)/scale,centerDistancePhysical:next.left-first.left,gapCss:gap,visibleSlots:(node.clientWidth+gap)/(cssWidth+gap),visibleItemsIncludingClippedEdges:items.filter(item=>{const box=item.getBoundingClientRect();return box.right>viewport.left+1&&box.left<viewport.right-1;}).length,selectedDate:picked.dataset.date,selectionVisible:card.left>=viewport.left-1&&card.right<=viewport.right+1,overflow:panel.scrollWidth>panel.clientWidth+1};
});}
async function swipe(direction){
  await strip().scrollIntoViewIfNeeded();const box=await strip().boundingBox(),before=await strip().evaluate(el=>el.scrollLeft),picked=await selected().getAttribute('data-date'),startX=box.x+box.width*(direction<0?.8:.2),y=box.y+box.height*.55;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y}]});for(let i=1;i<=12;i++){await page.waitForTimeout(20);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+box.width*direction*.6*i/12,y}]});}await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
  const after=await strip().evaluate(el=>el.scrollLeft);assert.ok(direction<0?after>before+20:after<before-20,`真实触摸应向相应方向滚动：${before} → ${after}`);assert.equal(await selected().getAttribute('data-date'),picked,'滚动日期条不应误选日期');assert.equal(await strip().locator('.date-item').count(),181,'连续日期窗口应保持181项');
}
try{
  await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date(2026,9,2,9));await page.goto(url);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await page.waitForTimeout(250);
  for(const viewport of [{width:1304,height:892},{width:844,height:390},{width:390,height:844},{width:320,height:760}])for(const scale of [1,1.1,1.35]){
    const wide=viewport.width>=700,percent=Math.round(scale*100);await page.setViewportSize(viewport);await seed(scale);
    await check(`${viewport.width}×${viewport.height}、${percent}%：${wide?'七天紧凑等宽':'手机原四卡宽度'}，选中日期与间距正确`,async()=>{
      await visibleSelection();const result=await metrics();geometry.push({viewport,scale,...result});assert.equal(result.selectedDate,'2026-10-02');assert.equal(result.selectionVisible,true);assert.equal(result.overflow,false);assert.equal(result.gapCss,6);
      if(wide){assert.ok(result.panelCssWidth<=592.2,JSON.stringify(result));assert.ok(result.selectedCssWidth<=77,JSON.stringify(result));assert.ok(result.selectedCssWidth>=55,JSON.stringify(result));assert.ok(result.centerDistanceCss<=83,JSON.stringify(result));assert.ok(Math.abs(result.visibleSlots-7)<.02,'宽屏保留原七天卡片宽度算法');}
      else{assert.ok(Math.abs(result.selectedCssWidth-(result.stripCssWidth-18)/4)<.4,`手机日期卡尺寸应保持原公式：${JSON.stringify(result)}`);}
      assert.ok(Math.abs(result.centerDistanceCss-result.selectedCssWidth-6)<.4,'相邻日期中心距应等于卡宽加6px间隙');await page.screenshot({path:`build/evidence/${version}-date-strip-${viewport.width}x${viewport.height}-${percent}.png`});
    });
  }
  await page.setViewportSize({width:1304,height:892});await seed(1.1);const original=await schedule();
  await check('紧凑宽屏点击日期仍显示对应课程，导航往返保留选中日期与焦点',async()=>{
    await strip().locator('.date-item[data-date="2026-10-03"]').click();await page.waitForTimeout(360);assert.equal(await selected().getAttribute('data-date'),'2026-10-03');assert.equal(await home().locator('[data-course-id="spacing-day-6"]').count(),1);
    const course=home().locator('[data-course-id="spacing-day-6"]');await course.click();await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();await page.getByRole('dialog',{name:'验证课程 6详情',exact:true}).waitFor({state:'detached'});assert.equal(await selected().getAttribute('data-date'),'2026-10-03');assert.equal((await homeFocus()).course,'spacing-day-6');const beforeFocus=await homeFocus();await goTab(page,'搜索');await goTab(page,'列表');assert.equal(await selected().getAttribute('data-date'),'2026-10-03');assert.deepEqual(await homeFocus(),beforeFocus,'切换页面应保持日期、节次与课程阅读焦点');await visibleSelection();assert.deepEqual(await schedule(),original);
  });
  await check('宽屏真实左右滑动仍连续滚动日期，保持选择并避免误触课程',async()=>{await swipe(-1);await swipe(1);assert.deepEqual(await schedule(),original);});
  await check('月历跳转仍同步紧凑日期条，选中背景完整进入可见范围',async()=>{
    await home().getByRole('button',{name:'选择日期',exact:true}).click();const picker=page.locator('dialog[open]').filter({has:page.locator('.calendar-picker')});await picker.getByRole('button',{name:'2026-10-16，1 门课程',exact:true}).click();await page.waitForTimeout(360);assert.equal(await selected().getAttribute('data-date'),'2026-10-16');await visibleSelection();assert.equal(await home().locator('[data-course-id="spacing-day-5"]').count(),1);assert.deepEqual(await schedule(),original);
  });
  await check('宽屏与手机来回调整窗口仍恢复同一天，手机真实左右滑动正常',async()=>{
    await page.setViewportSize({width:390,height:844});await visibleSelection();assert.equal(await selected().getAttribute('data-date'),'2026-10-16');await swipe(-1);await swipe(1);await page.setViewportSize({width:1304,height:892});await visibleSelection();assert.equal(await selected().getAttribute('data-date'),'2026-10-16');assert.deepEqual(await schedule(),original);
  });
  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-date-strip-spacing-results.json`,JSON.stringify({version,completed:true,checks,geometry,errors,scope:'隔离浏览器与虚构课程；仅日期条视觉约束，真实Chromium touch验证'},null,2));
}finally{await browser.close();}
