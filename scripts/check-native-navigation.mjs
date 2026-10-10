/** Actual Android navigation audit on an isolated emulator; never uninstall or clear app data. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {_android} from 'playwright';

const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,item,index,all)=>{if(item.startsWith('--'))pairs.push([item.slice(2),all[index+1]?.startsWith('--')?true:all[index+1]??true]);return pairs;},[]));
const serial=args.serial??'emulator-5562',pkg=args.package??'com.dolphin.calendar',cdp=Boolean(args.cdp),layoutChecks=Boolean(args['layout-checks']);
assert.match(serial,/^emulator-\d+$/,'Only the task emulator can be used');
assert.ok(['com.dolphin.calendar','com.dolphin.calendar.debug'].includes(pkg));
assert.ok(!cdp||pkg.endsWith('.debug'),'CDP is only available on the isolated debug package');
assert.ok(!layoutChecks||cdp,'Compact layout checks require the isolated debug WebView');
assert.ok(!args.seed||(cdp&&pkg.endsWith('.debug')),'Seeding is limited to a fresh isolated debug package');
const adbPath=args.adb??path.join(process.env.ANDROID_HOME??'D:/Android/Sdk','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const version=readFileSync('web/src/meta.ts','utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const prefix=args.prefix??`${version}-native`,course=args.course??'RetainedCourse10403';
const output=path.resolve('build/evidence');mkdirSync(output,{recursive:true});
const run=(...command)=>execFileSync(adbPath,['-s',serial,...command],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#10;/g,'\n').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const label=n=>n.text||n['content-desc']||'';
const bounds=n=>n.bounds.match(/\d+/g).map(Number);
const visible=n=>n.bounds&&n.bounds!=='[0,0][0,0]';
let xml='',device,page,firstError;
function parse(tree){
  const parents=[],nodes=[];
  for(const token of tree.matchAll(/<\/?node\b[^>]*>/g)){
    if(token[0].startsWith('</')){parents.pop();continue;}
    const node=Object.fromEntries(Array.from(token[0].matchAll(/([\w-]+)="([^"]*)"/g),m=>[m[1],decode(m[2])]));
    node.inWebView=parents.includes('android.webkit.WebView');nodes.push(node);
    if(!token[0].endsWith('/>'))parents.push(node.class);
  }
  return nodes;
}
function dump(){
  const result=run('shell','uiautomator','dump','/sdcard/dolphin-native-audit.xml');
  if(!result.includes('dumped to:'))return [];
  xml=run('shell','cat','/sdcard/dolphin-native-audit.xml');return parse(xml);
}
const destinations=['列表','平铺','搜索','设置'];
const nativeButtons=ui=>ui.filter(n=>!n.inWebView&&n.class==='android.widget.Button'&&n.clickable==='true'&&destinations.includes(n['content-desc'])&&!n.text&&visible(n));
const imeShown=()=>/mInputShown=true/.test(run('shell','dumpsys','input_method'));
async function waitFor(predicate,reason){for(let attempt=0;attempt<15;attempt++){const ui=dump();if(predicate(ui))return ui;await sleep(400);}throw Error(reason);}
function tap(node){assert.ok(node&&visible(node),'Expected a visible Android control');const b=bounds(node);run('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function select(text,content){
  let ui=await waitFor(ui=>nativeButtons(ui).length===4,'Native navigation did not appear');tap(nativeButtons(ui).find(n=>n['content-desc']===text));
  ui=await waitFor(ui=>nativeButtons(ui).some(n=>n['content-desc']===text&&n.selected==='true'),'Native selection did not receive Web confirmation');
  // Existing list/grid focus restoration may return midway through a page; scroll to its heading for proof.
  for(let attempt=0;content&&!ui.some(n=>content(n)&&visible(n))&&attempt<6;attempt++){
    const b=bounds(ui.find(n=>n.class==='android.webkit.WebView'&&visible(n))),x=Math.round((b[0]+b[2])*0.6),height=b[3]-b[1];
    // In landscape, the horizontal date strip may occupy the top fifth and intentionally reject vertical gestures.
    run('shell','input','swipe',String(x),String(Math.round(b[1]+height*.45)),String(x),String(Math.round(b[1]+height*.85)),'350');ui=dump();
  }
  assert.ok(!content||ui.some(n=>content(n)&&visible(n)),'Web page content did not match the native selected destination');
  if(page)assert.equal(await page.locator('.tab-screen.active').getAttribute('data-screen'),({列表:'list',平铺:'grid',搜索:'search',设置:'settings'})[text]);
  return ui;
}
async function editorBack(){
  if(imeShown()){run('shell','input','keyevent','4');await waitFor(()=>!imeShown(),'Keyboard Back must dismiss the IME');}
  run('shell','input','keyevent','4');
  return waitFor(ui=>ui.some(n=>n.text==='放弃修改'&&n.class==='android.widget.Button'&&visible(n))&&nativeButtons(ui).length===0,'Unsaved course draft must stay guarded on Android Back');
}
function capture(name){writeFileSync(path.join(output,`${prefix}-${name}.xml`),xml);run('shell','screencap','-p','/sdcard/dolphin-native-audit.png');run('pull','/sdcard/dolphin-native-audit.png',path.join(output,`${prefix}-${name}.png`));}
function rotate(value){run('shell','settings','put','system','accelerometer_rotation','0');run('shell','settings','put','system','user_rotation',String(value));}
const rotation={auto:run('shell','settings','get','system','accelerometer_rotation'),user:run('shell','settings','get','system','user_rotation')};
const density=Number(run('shell','wm','density').match(/(?:Override|Physical) density:\s*(\d+)/g)?.at(-1)?.match(/\d+/)?.[0])/160;
assert.ok(density>0);
const report={at:new Date().toISOString(),serial,pkg,cdp,density,scope:'Task emulator only; UI input drafts are discarded; app is never uninstalled or cleared; original rotation settings are restored.',checks:[],geometry:{},status:'running'};
if(args.apk)report.apkSHA256=createHash('sha256').update(readFileSync(args.apk)).digest('hex');
const installedPath=run('shell','pm','path',pkg).split('\n').find(line=>line.startsWith('package:'))?.slice(8);
assert.ok(installedPath,'Audited app must already be installed');
report.installedApkSHA256=run('shell','sha256sum',installedPath).split(/\s+/)[0];
if(args.apk)assert.equal(report.installedApkSHA256,report.apkSHA256,'UI audit must operate on the exact supplied APK');
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
async function webGeometry(layout,ui){
  if(!page)return;
  await page.waitForFunction(layout=>document.documentElement.dataset.navigationLayout===layout&&document.documentElement.dataset.nativeNavigation==='true',layout);
  const metrics=await page.evaluate(()=>{
    const root=document.documentElement,host=document.querySelector('.screen-host'),rect=host.getBoundingClientRect();
    return {screen:{left:rect.left,right:rect.right,bottom:rect.bottom},height:innerHeight,width:innerWidth,left:Number.parseFloat(root.style.getPropertyValue('--native-navigation-left')),right:Number.parseFloat(root.style.getPropertyValue('--native-navigation-right')),bottom:Number.parseFloat(root.style.getPropertyValue('--native-navigation-bottom')),webNavigation:document.querySelectorAll('.primary-navigation').length};
  });
  assert.equal(metrics.webNavigation,0,'Confirmed Android capability must remove Web navigation');
  const items=nativeButtons(ui),first=bounds(items[0]);
  if(layout==='bottom'){assert.ok(Math.abs(metrics.screen.bottom-first[1]/density)<2,'Web content must stop at the native bar');assert.ok(metrics.bottom>=80);}
  else {assert.ok(Math.abs(metrics.screen.left-first[2]/density)<2,'Web content must begin after the native rail');assert.ok(metrics.left>=88);}
  report.geometry[`${layout}Web`]=metrics;pass(`${layout} native occupancy matches actual WebView content bounds; no duplicate Web bar`);
}
async function actualSwipe(selector,direction,gestureContainer){
  const region=typeof selector==='string'?page.locator(selector):selector;await region.scrollIntoViewIfNeeded();const box=await region.boundingBox();assert.ok(box);
  const gestureBox=gestureContainer?await gestureContainer.boundingBox():box;assert.ok(gestureBox);
  const from=box.x+box.width*(direction==='left'?.82:.18),to=gestureContainer?from+gestureBox.width*.6*(direction==='left'?-1:1):box.x+box.width*(direction==='left'?.18:.82),y=box.y+box.height*.5;
  run('shell','input','swipe',String(Math.round(from*density)),String(Math.round(y*density)),String(Math.round(to*density)),String(Math.round(y*density)),'320');
  // Start a year gesture on the hint, away from editable inputs, and allow the 200 ms settlement to finish.
  await sleep(460);
  return {direction,region:box,container:gestureBox,from:{x:from,y},to:{x:to,y},duration:320};
}
async function storedLayoutState(){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('dolphin-calendar',1);request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,read=db.transaction('state','readonly').objectStore('state').get('app');read.onerror=()=>{db.close();reject(read.error);};read.onsuccess=()=>{const data=read.result;db.close();resolve({schedule:data.schedule,settings:data.settings,books:data.books});};};
  }));
}
async function compactLayouts(){
  const scale=1.1,before=await storedLayoutState(),shell=page.locator('.app-shell');
  const original=await shell.evaluate(el=>({value:el.style.getPropertyValue('--ui-scale'),priority:el.style.getPropertyPriority('--ui-scale')}));
  const layoutReport=report.compactLayout={at:new Date().toISOString(),version,serial,pkg,apkSHA256:report.apkSHA256,installedApkSHA256:report.installedApkSHA256,scale,scope:'Read existing synthetic fixture; temporarily apply CSS 110%; never edit time values or persist preferences.',checks:[],geometry:[],status:'running'};
  const record=name=>{layoutReport.checks.push(name);pass(name);},hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  try{
    await shell.evaluate((el,scale)=>el.style.setProperty('--ui-scale',String(scale)),scale);
    for(const [orientation,rotationValue] of [['portrait',0],['landscape',1]]){
      rotate(rotationValue);await waitFor(ui=>{const nav=nativeButtons(ui);return nav.length===4&&new Set(nav.map(n=>bounds(n)[orientation==='portrait'?1:0])).size===1;},'Expected native orientation before the compact layout audit');
      await select('列表',n=>n.text==='选择日期');
      const active=page.locator('.screen.active'),strip=active.locator('.date-strip');await strip.scrollIntoViewIfNeeded();await sleep(300);
      const dates=await strip.evaluate(el=>{
        const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},viewport=box(el),items=[...el.querySelectorAll('.date-item')].map(item=>({...box(item),date:item.dataset.date}));
        return {viewport,panel:box(el.closest('.date-panel')),itemWidth:items[0].width,visible:items.filter(item=>item.x>=viewport.x-1&&item.right<=viewport.right+1),selected:el.querySelector('[aria-pressed=true]')?.dataset.date,scrollLeft:el.scrollLeft,screenWidth:innerWidth,screenFits:el.closest('.screen').scrollWidth<=el.closest('.screen').clientWidth+1};
      });
      assert.ok(dates.screenFits);assert.ok(dates.panel.x>=-1&&dates.panel.right<=dates.screenWidth+1);assert.ok(dates.panel.width<=592*scale+1);
      assert.ok(dates.itemWidth>=48&&dates.itemWidth<=90*scale+1,'Dates must stay compact while preserving touch targets');assert.ok(dates.visible.length>=(orientation==='portrait'?3:6));assert.ok(dates.selected);
      await actualSwipe(strip,'left');const movedLeft=await strip.evaluate(el=>el.scrollLeft);assert.ok(movedLeft>dates.scrollLeft+20,'A physical swipe must actually scroll the continuous dates');
      await actualSwipe(strip,'right');const movedRight=await strip.evaluate(el=>el.scrollLeft);assert.ok(movedRight<movedLeft-20);assert.equal(await strip.locator('[aria-pressed=true]').getAttribute('data-date'),dates.selected,'Scrolling must not select an unrelated day');
      await strip.evaluate((el,left)=>el.scrollLeft=left,dates.scrollLeft);await sleep(300);dump();capture(`compact-dates-${orientation}`);
      layoutReport.geometry.push({orientation,dates:{...dates,physicalScroll:{left:movedLeft,right:movedRight}}});record(`${orientation} actual Android date strip stays compact at 110% and supports physical continuous swipes without selecting another day`);
      await select('设置',n=>n.text==='管理课表，安排提醒，调整你的界面。');await page.locator('.screen.active [data-setting=editor]').click();
      await page.locator('.screen.active[data-screen=editor]').getByRole('button',{name:'上课时间',exact:true}).click();
      const times=page.locator('.screen.active[data-screen=times]');await times.waitFor();await page.waitForFunction(()=>{const r=document.querySelector('.screen.active[data-screen=times]')?.getBoundingClientRect();return r&&r.x>=-1&&r.right<=innerWidth+1;});
      await waitFor(ui=>nativeButtons(ui).length===0,'The time settings subpage must keep native navigation hidden');
      const rows=await times.locator('.period-editor').evaluateAll(rows=>rows.map(row=>{
        const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},label=row.querySelector('span'),range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect();
        return {label:{...box(label),text:label.textContent,textBox:{x:text.x,y:text.y,right:text.right,bottom:text.bottom}},card:box(row.closest('.time-list')),inputs:[...row.querySelectorAll('input')].map(input=>({...box(input),type:input.type,value:input.value,scrollWidth:input.scrollWidth,clientWidth:input.clientWidth})),screenWidth:innerWidth};
      }));
      assert.equal(rows.length,before.schedule.periods.length);assert.ok(rows.length>=10,'The retained fixture must exercise two-digit period labels');
      const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
      for(const [index,row]of rows.entries()){
        const label=row.label,text=label.textBox;assert.equal(label.text,`第 ${index+1} 节`);assert.equal(row.inputs.length,2);
        assert.ok(text.x>=label.x-1&&text.right<=label.right+1&&text.y>=label.y-1&&text.bottom<=label.bottom+1,`Period ${index+1} text must fit its label`);
        for(const [field,input]of row.inputs.entries()){
          assert.equal(input.type,'time');assert.equal(input.value,before.schedule.periods[index][field?'end':'start']);assert.ok(!overlaps(label,input),`Period ${index+1} label must not intersect a time input`);
          assert.ok(input.x>=row.card.x-1&&input.right<=row.card.right+1&&input.right<=row.screenWidth+1);assert.ok(input.width<=112*scale+1,'Time inputs must not expand into oversized blocks');assert.ok(input.height>=44);assert.ok(input.scrollWidth<=input.clientWidth+1);
        }
        assert.ok(!overlaps(row.inputs[0],row.inputs[1]),`Period ${index+1} time inputs must not overlap`);
      }
      assert.ok(await times.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await times.locator('.period-editor').last().scrollIntoViewIfNeeded();dump();capture(`compact-times-${orientation}`);
      layoutReport.geometry.at(-1).periodRows=rows;record(`${orientation} actual Android period labels, including two digits, fit beside compact nonoverlapping time inputs at 110%`);
      run('shell','input','keyevent','4');await page.locator('.screen.active[data-screen=editor]').waitFor();await sleep(350);run('shell','input','keyevent','4');await waitFor(ui=>nativeButtons(ui).length===4,'Read-only time settings Back must restore native navigation');
    }
    const after=await storedLayoutState();assert.deepEqual(after,before,'Layout checks must preserve saved courses, term, times, books and preferences');layoutReport.retention={beforeSHA256:hash(before),afterSHA256:hash(after),unchanged:true};layoutReport.status='passed';
  }catch(error){layoutReport.status='failed';layoutReport.error=error.stack;throw error;}
  finally{
    await shell.evaluate((el,saved)=>{if(saved.value)el.style.setProperty('--ui-scale',saved.value,saved.priority);else el.style.removeProperty('--ui-scale');},original);
    layoutReport.cssRestored=await shell.evaluate((el,saved)=>el.style.getPropertyValue('--ui-scale')===saved.value&&el.style.getPropertyPriority('--ui-scale')===saved.priority,original);
    writeFileSync(path.join(output,`${args['layout-prefix']??`${version}-native-compact-layout`}-results.json`),JSON.stringify(layoutReport,null,2)+'\n');
  }
}
try{
  rotate(0);run('shell','am','force-stop',pkg);run('shell','am','start','-n',`${pkg}/com.dolphin.calendar.MainActivity`);
  if(cdp){
    device=(await _android.devices()).find(d=>d.serial()===serial);assert.ok(device);page=await(await device.webView({pkg})).page();await page.locator('.load-note').waitFor({state:'hidden'});
    if(args.seed){
      await page.waitForFunction(()=>document.querySelector('dialog[open] .onboarding')||document.querySelector('.app-shell[data-navigation-visible=true]'));
      const savedCount=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('state').objectStore('state').get('app');read.onerror=()=>reject(read.error);read.onsuccess=()=>{resolve(read.result?.schedule?.courses?.length??0);db.close();};};}));
      assert.equal(savedCount,0,'Never replace existing debug courses while preparing a fixture');
      const skip=page.getByRole('button',{name:'先逛一逛',exact:true});if(await skip.isVisible())await skip.click();
      await page.getByRole('button',{name:'导入课表',exact:true}).click();await page.getByText('粘贴 JSON 内容',{exact:true}).click();
      const fixture={term:{name:'NativeNavigationAudit10405',startDate:new Date().toISOString().slice(0,10),weeks:20},courses:[{name:course,teacher:'SyntheticTeacher',room:'2栋206号教室',day:4,start:3,end:4,weeks:Array.from({length:20},(_,index)=>index+1),notes:'Synthetic emulator fixture',color:'sage'}]};
      await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(fixture));await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();
      report.fixture={method:'Actual JSON import UI on a fresh isolated debug package',...fixture};pass('Fresh debug fixture imports through the existing JSON preview/confirmation UI');
    }
  }
  let ui=await waitFor(ui=>nativeButtons(ui).length===4,'Four actual Android navigation buttons are required');
  const bottom=nativeButtons(ui).map(n=>({label:n['content-desc'],selected:n.selected,bounds:bounds(n)}));
  assert.equal(bottom.filter(n=>n.selected==='true').length,1);
  assert.ok(bottom.every(n=>Math.abs((n.bounds[3]-n.bounds[1])/density-80)<1&&((n.bounds[2]-n.bounds[0])/density)>=48));
  assert.equal(new Set(bottom.map(n=>n.bounds[1])).size,1);report.geometry.bottom=bottom;capture('portrait');pass('Four real Android buttons outside WebView form an 80 dp bottom bar with one selected destination and ≥48 dp targets');
  await webGeometry('bottom',ui);
  ui=await select('搜索',n=>n.text==='查找整个课表中的课程、教师或教室。');capture('search-selected');pass('Native click updates Web destination and the confirmed native selected state');
  const searchInput=ui.find(n=>n.class==='android.widget.EditText'&&/搜索课程|课程、教师或教室/.test(label(n)+' '+(n.hint??''))&&visible(n));tap(searchInput);
  ui=await waitFor(ui=>nativeButtons(ui).length===0&&imeShown(),'IME must appear and native navigation must hide');report.imeEvidence=run('shell','dumpsys','input_method').split('\n').filter(line=>/mInputShown|mIsInputViewShown/.test(line)).map(line=>line.trim());capture('keyboard');
  if(page)assert.equal(await page.evaluate(()=>document.documentElement.dataset.keyboard),'true');pass('Actual Android keyboard hides native navigation and its occupied band');
  run('shell','input','keyevent','4');ui=await waitFor(ui=>nativeButtons(ui).length===4,'Native navigation must return after keyboard Back');pass('Keyboard Back restores navigation without leaving Search');
  ui=await select('列表',n=>n.text==='选择日期');tap(ui.find(n=>n.text==='选择日期'&&n.class==='android.widget.Button'&&visible(n)));
  ui=await waitFor(ui=>nativeButtons(ui).length===0&&ui.some(n=>n.text==='选择日期'&&n.class==='android.widget.TextView'&&visible(n)),'Calendar modal must hide native navigation');capture('calendar');pass('Calendar dialog hides native navigation and remains above page content');
  if(page){
    const monthButton=page.locator('.calendar-month'),initial=await monthButton.innerText(),match=initial.match(/(\d+)年(\d+)月/),year=Number(match[1]),month=Number(match[2]);
    await actualSwipe('.calendar-viewport','left');assert.equal(await monthButton.innerText(),`${month===12?year+1:year}年${month===12?1:month+1}月`);
    await actualSwipe('.calendar-viewport','right');assert.equal(await monthButton.innerText(),initial);pass('Physical Android month swipes change months in both directions without accidentally selecting a date');
    await monthButton.click();const yearControl=page.getByRole('group',{name:'滑动切换年份',exact:true}),yearInput=page.getByLabel('日历年份',{exact:true}),initialYear=Number(await yearInput.inputValue());
    assert.equal(await page.locator('.calendar-year-field').count(),1);assert.equal(await yearControl.count(),1);assert.equal(await yearInput.count(),1);
    assert.equal(await yearControl.getByRole('button',{name:'上一年',exact:true}).count(),1);assert.equal(await yearControl.getByRole('button',{name:'下一年',exact:true}).count(),1);
    const yearHint=yearControl.locator('.calendar-year-hint');assert.equal(await yearHint.count(),1);
    report.yearControl={inputs:1,previousButtons:1,nextButtons:1,initialYear,physicalGestures:[]};
    report.yearControl.physicalGestures.push(await actualSwipe(yearHint,'left',yearControl));assert.equal(Number(await yearInput.inputValue()),initialYear+1);
    ui=dump();capture('calendar-year-next');
    report.yearControl.physicalGestures.push(await actualSwipe(yearHint,'right',yearControl));assert.equal(Number(await yearInput.inputValue()),initialYear);
    ui=dump();assert.equal(nativeButtons(ui).length,0);capture('calendar-year-swiped');pass('A single year input/arrow/hint control supports physical Android swipes in both directions while native navigation stays hidden');
  }
  run('shell','input','keyevent','4');ui=await waitFor(ui=>nativeButtons(ui).length===4,'Calendar Back must return to the selected page');pass('Android Back dismisses the calendar and restores the selected page');
  rotate(1);ui=await waitFor(ui=>{const nav=nativeButtons(ui);return nav.length===4&&new Set(nav.map(n=>bounds(n)[0])).size===1;},'Landscape must use a native side rail');
  const rail=nativeButtons(ui).map(n=>({label:n['content-desc'],selected:n.selected,bounds:bounds(n)}));
  assert.ok(rail.every(n=>Math.abs((n.bounds[2]-n.bounds[0])/density-88)<1&&(n.bounds[3]-n.bounds[1])/density>=48));
  report.geometry.rail=rail;capture('landscape');pass('Landscape switches to a real 88 dp native rail with four accessible ≥48 dp destinations');await webGeometry('rail',ui);
  for(const [text,heading] of [['平铺',n=>n.text==='平铺课表'||/^周[一二三四五六日]第\d+节添加临时课程$/.test(n.text)],['搜索',n=>n.text==='查找整个课表中的课程、教师或教室。'],['设置',n=>n.text==='管理课表，安排提醒，调整你的界面。'],['列表',n=>n.text==='选择日期']])await select(text,heading);
  pass('All four native rail destinations open their existing pages');
  if(page){
    await page.getByRole('button',{name:'选择日期',exact:true}).click();await page.locator('.calendar-month').click();
    const control=page.getByRole('group',{name:'滑动切换年份',exact:true}),input=control.getByLabel('日历年份',{exact:true}),year=Number(await input.inputValue());
    assert.equal(await control.count(),1);assert.equal(await input.count(),1);
    await actualSwipe(control.locator('.calendar-year-hint'),'left',control);assert.equal(Number(await input.inputValue()),year+1);
    await actualSwipe(control.locator('.calendar-year-hint'),'right',control);assert.equal(Number(await input.inputValue()),year);
    ui=dump();assert.equal(nativeButtons(ui).length,0);capture('calendar-year-landscape');
    await page.locator('.calendar-footer').getByRole('button',{name:'回到今天',exact:true}).click();ui=await waitFor(ui=>nativeButtons(ui).length===4,'Landscape calendar Today must restore the selected native rail');
    assert.ok(nativeButtons(ui).some(n=>n['content-desc']==='列表'&&n.selected==='true'));
    pass('Landscape single year control supports physical Android hint swipes and Today returns to the selected native rail');
  }
  rotate(0);ui=await waitFor(ui=>{const nav=nativeButtons(ui);return nav.length===4&&new Set(nav.map(n=>bounds(n)[1])).size===1;},'Portrait must restore bottom navigation');pass('Rotating back restores the bottom bar and selected page');
  ui=await select('搜索',n=>n.text==='查找整个课表中的课程、教师或教室。');
  tap(ui.find(n=>n.class==='android.widget.Button'&&n.text.includes(course)&&visible(n)));
  ui=await waitFor(ui=>nativeButtons(ui).length===0&&ui.some(n=>n.text.includes(course+'详情')),'Course detail must hide native navigation');capture('course-detail');
  for(let attempt=0;attempt<8&&!ui.some(n=>n.text==='编辑这门课程'&&n.clickable==='true'&&visible(n));attempt++){run('shell','input','swipe','540','1850','540','700','400');ui=dump();}
  tap(ui.find(n=>n.text==='编辑这门课程'&&n.clickable==='true'&&visible(n)));
  ui=await waitFor(ui=>nativeButtons(ui).length===0&&ui.some(n=>n.class==='android.widget.EditText'&&n.text===course&&visible(n)),'Course editor must keep native navigation hidden');capture('course-editor');
  if(page){await page.locator('dialog[open]').getByLabel('课程名',{exact:true}).fill(course+'NativeUnsavedAudit');}
  else {tap(ui.find(n=>n.class==='android.widget.EditText'&&n.text===course&&visible(n)));await waitFor(()=>imeShown(),'Tap must focus the course field and open the keyboard');run('shell','input','keyevent','123');run('shell','input','text','NativeUnsavedAudit');}
  await waitFor(ui=>ui.some(n=>n.class==='android.widget.EditText'&&n.text.includes('NativeUnsavedAudit')&&visible(n)),'The test must actually change the unsaved course draft');
  ui=await editorBack();capture('editor-back-guard');pass('Course editing hides navigation; Android Back preserves unsaved changes behind the existing discard guard');
  tap(ui.find(n=>n.text==='继续编辑'&&n.class==='android.widget.Button'&&visible(n)));ui=await waitFor(ui=>ui.some(n=>n.class==='android.widget.EditText'&&n.text.includes('NativeUnsavedAudit')&&visible(n)),'Continue editing must preserve the draft');
  ui=await editorBack();tap(ui.find(n=>n.text==='放弃修改'&&n.class==='android.widget.Button'&&visible(n)));
  ui=await waitFor(ui=>nativeButtons(ui).length===4&&ui.some(n=>n.text.includes(course)&&!n.text.includes('NativeUnsavedAudit')&&visible(n)),'Discarding must restore navigation and the unchanged saved course');capture('editor-discarded');pass('Continue preserves the draft; discard returns to the native destination and leaves the saved synthetic course unchanged');
  if(layoutChecks)await compactLayouts();
  report.status='passed';
}catch(error){firstError=error;report.status='failed';report.error=error.stack;}
finally{
  if(firstError&&xml)writeFileSync(path.join(output,`${prefix}-failure.xml`),xml);
  for(const [key,value] of Object.entries({accelerometer_rotation:rotation.auto,user_rotation:rotation.user}))run('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
  await device?.close();run('shell','am','force-stop',pkg);report.rotationRestored=true;writeFileSync(path.join(output,`${prefix}-results.json`),JSON.stringify(report,null,2)+'\n');
}
if(firstError)throw firstError;
