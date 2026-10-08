import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {_android} from 'playwright';
import {setTimeout as delay} from 'node:timers/promises';

const serial=process.env.ANDROID_SERIAL;
assert.ok(serial?.startsWith('emulator-'),'此测试只对专用 Android 虚拟机执行');
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:20000});
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
const app='com.dolphin.calendar.debug',authority='content://com.android.calendar';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
function query(table,projection,where){return adb('shell','content','query','--uri',`${authority}/${table}`,'--projection',projection,...(where?['--where',quote(where)]:[])).replaceAll('\r\n','\n');}
function owned(){return [...query('calendars','_id:visible',`account_name='${app}' AND account_type='LOCAL'`).matchAll(/_id=(\d+), visible=(\d+)/g)].map(m=>({id:Number(m[1]),visible:m[2]==='1'}));}
function events(){return owned().filter(calendar=>calendar.visible).map(calendar=>query('events','_id:calendar_id:title:dtstart:dtend:eventLocation:description:eventTimezone',`calendar_id=${calendar.id} AND deleted=0`)).join('\n');}
function count(){return (events().match(/^Row: /gm)??[]).length;}
assert.equal(owned().length,0,'虚拟机已有 Dolphin 系统日历，请换用空日历的测试设备');
adb('shell','input','keyevent','4');
adb('shell','am','force-stop',app);
adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');
for(const permission of ['READ_CALENDAR','WRITE_CALENDAR']){
 adb('shell','pm','revoke',app,`android.permission.${permission}`);
 adb('shell','pm','clear-permission-flags',app,`android.permission.${permission}`,'user-set','user-fixed');
}
adb('shell','am','start','-W','-n',`${app}/com.dolphin.calendar.MainActivity`);
const device=(await _android.devices()).find(device=>device.serial()===serial);assert.ok(device);
const page=await (await device.webView({pkg:app})).page();
const checks=[];const pass=name=>{checks.push(name);console.log('PASS '+name);};
await mkdir('build/evidence',{recursive:true});
async function state(value){return page.evaluate(value=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state',value===undefined?'readonly':'readwrite'),store=tx.objectStore('state');
 if(value!==undefined){if(value===null)store.delete('app');else store.put(value,'app');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);}
 else {const result=store.get('app');result.onsuccess=()=>{resolve(result.result??null);db.close();};result.onerror=()=>reject(result.error);}};request.onerror=()=>reject(request.error);
}),value);}
async function open(){await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:/导入到系统日历/}).click();}
async function importCourse(){await page.getByRole('button',{name:'导入到系统日历',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();}
async function result(text){await page.locator('.calendar-result').filter({hasText:text}).waitFor({timeout:15000});}
async function restore(){await page.getByRole('button',{name:'复原到导入前',exact:true}).click();await page.getByRole('button',{name:'确认复原',exact:true}).click();await result(/已撤销|已复原/);}
let original,externalId;
try {
 original=await state();
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
 const fixture=await state();fixture.onboarded=true;fixture.settings={...fixture.settings,notificationsEnabled:false};
 fixture.schedule={term:{name:'跨学年日历验证',startDate:'2026-09-01',weeks:56},periods:[{start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'},{start:'',end:''}],courses:[
  {id:'calendar-one',name:'日历验证数学',teacher:'陈老师',room:'16-203/202',day:3,start:1,end:2,weeks:[1,53],color:'sage',notes:'课程备注'},
  {id:'calendar-two',name:'日历验证英语',teacher:'林老师',room:'博学楼A106号教室',day:5,start:1,end:1,weeks:[1,53],color:'blue',notes:''},
  {id:'calendar-untimed',name:'未定时课程',teacher:'',room:'',day:2,start:3,end:3,weeks:[1],color:'rose',notes:''}
 ]};fixture.books={'日历验证数学':{title:'日历测试教材',publisher:'',edition:'',text:'',source:'manual'}};
 await state(fixture);await page.reload();await open();
 assert.equal(await page.getByRole('button',{name:'复原到导入前',exact:true}).isDisabled(),true);
 assert.match(adb('shell','dumpsys','package',app),/READ_CALENDAR: granted=false/);pass('打开设置不提前请求日历权限，空复原记录禁用按钮');
 await importCourse();await device.tap({text:'Don’t allow',pkg:'com.google.android.permissioncontroller'},{timeout:15000});
 await result('未授予日历权限');assert.equal(owned().length,0);pass('拒绝日历权限后没有写入任何系统课程');
 for(const permission of ['READ_CALENDAR','WRITE_CALENDAR'])adb('shell','pm','clear-permission-flags',app,`android.permission.${permission}`,'user-set','user-fixed');
 const externalUri=`${authority}/calendars?caller_is_syncadapter=true&account_name=dolphin-calendar-test&account_type=LOCAL`;
 const created=adb('shell','content','insert','--uri',quote(externalUri),'--bind','account_name:s:dolphin-calendar-test','--bind','account_type:s:LOCAL','--bind','name:s:UnrelatedTest','--bind','calendar_displayName:s:UnrelatedTest','--bind','calendar_access_level:i:700','--bind','ownerAccount:s:dolphin-calendar-test','--bind','visible:i:1','--bind','sync_events:i:1','--bind','calendar_timezone:s:GMT');
 // content insert 不返回 ID，查询测试账号以定位独立日历。
 externalId=Number(query('calendars','_id',"account_name='dolphin-calendar-test'").match(/_id=(\d+)/)?.[1]);assert.ok(externalId,created);
 adb('shell','content','insert','--uri',`${authority}/events`,'--bind',`calendar_id:l:${externalId}`,'--bind','title:s:UnrelatedEvent','--bind','dtstart:l:1790000000000','--bind','dtend:l:1790003600000','--bind','eventTimezone:s:GMT');
 await importCourse();await device.tap({res:'com.android.permissioncontroller:id/permission_allow_button'},{timeout:15000});await result('已导入 4 次');
 assert.match(await page.locator('.calendar-result').innerText(),/1 次因上课时间/);assert.equal(count(),4);
 const rows=events();assert.match(rows,/由 Dolphin Calendar 创建\n教师：陈老师\n位置：16栋203号教室/);assert.match(rows,/eventLocation=16栋203号教室/);assert.match(rows,/教材：日历测试教材/);assert.match(rows,/备注：课程备注/);
 const dates=await page.evaluate(()=>[new Date(2026,8,2,8,0).getTime(),new Date(2027,8,1,8,0).getTime()]);for(const date of dates)assert.match(rows,new RegExp(`dtstart=${date}`));
 await writeFile(`build/evidence/${version}-calendar-events.txt`,rows);pass('真实系统日程包含创建来源、教师、教室、教材，跨学年日期正确，未定时课程明确提示');
 await page.screenshot({path:`build/evidence/${version}-calendar-android.png`});
 await restore();assert.equal(owned().length,0);pass('首次导入复原后移除本次课程日历');
 await importCourse();await result('已导入 4 次');
 const changed=structuredClone(fixture);changed.schedule.courses=changed.schedule.courses.slice(0,2).map(course=>({...course,name:course.name+'更新',weeks:[2]}));
 await state(changed);await page.reload();await open();await importCourse();await result('已导入 2 次');assert.equal(count(),2);assert.match(events(),/日历验证数学更新/);
 await restore();assert.equal(count(),4);assert.doesNotMatch(events(),/日历验证数学更新/);pass('更新课表后复原恢复旧课程、原教师地点及跨学年日期');
 await state(fixture);await page.reload();await open();await importCourse();await result('已导入 4 次');await importCourse();await result('已导入 4 次');assert.equal(count(),4);assert.equal(owned().length,2);assert.equal(owned().filter(calendar=>calendar.visible).length,1);pass('重复导入不重复显示课程，只保留一份隐藏复原副本');
 await page.reload();await open();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='复原到导入前')?.disabled);await restore();assert.equal(count(),4);pass('重开页面后仍可复原最近一次导入');
 const invalid=structuredClone(fixture);invalid.schedule.periods=invalid.schedule.periods.map(()=>({start:'',end:''}));await state(invalid);await page.reload();await open();await importCourse();await result('没有可写入的课程');assert.equal(count(),4);pass('没有有效上课时间时保留已有系统课程并显示错误');
 await page.getByRole('button',{name:'清除已导入的课程',exact:true}).click();await page.getByRole('button',{name:'确认清除',exact:true}).click();await result('已清除');assert.equal(owned().length,0);assert.equal(await page.getByRole('button',{name:'复原到导入前',exact:true}).isDisabled(),true);
 assert.match(query('events','_id:title',`calendar_id=${externalId}`),/UnrelatedEvent/);pass('导入、复原和清除均保留其他日历的日程');
 const openedAfter=Number(adb('shell','date','+%s').trim())*1000;
 await page.getByRole('button',{name:'打开系统日历',exact:true}).click();
 let launched=false,calendarSetup=false,intent='';
 for(let attempt=0;attempt<30&&!launched;attempt++){
  const activities=adb('shell','dumpsys','activity','activities');
  const matches=[...activities.matchAll(/Intent \{ act=android.intent.action.VIEW dat=content:\/\/com.android.calendar\/time\/(\d+)[^}]*cmp=com.google.android.calendar\/[^}]+\}/g)];
  const current=matches.find(match=>Number(match[1])>=openedAfter);
  launched=!!current;intent=current?.[0]??'';calendarSetup=activities.includes('PreAddAccountActivity');
  if(!launched)await delay(200);
 }
 assert.ok(launched,'系统未启动此次请求的日历页面');
 await writeFile(`build/evidence/${version}-calendar-open.json`,JSON.stringify({intent,calendarSetup,detail:calendarSetup?'系统日历已启动，虚拟机 Google Calendar 随后要求配置账户；课程内容通过系统 Calendar Provider 验证':'系统日历已启动'},null,2));
 pass('打开系统日历按钮实际发起并启动日历页面');
 adb('shell','am','start','-n',`${app}/com.dolphin.calendar.MainActivity`);
} finally {
 adb('shell','am','start','-W','-n',`${app}/com.dolphin.calendar.MainActivity`);
 if(owned().length){
  await page.evaluate(()=>window.Dolphin.postMessage(JSON.stringify({type:'calendarClear'})));
  for(let attempt=0;attempt<50&&owned().length;attempt++)await page.waitForTimeout(100);
  assert.equal(owned().length,0,'临时课程日历清理未完成');
 }
 if(externalId)adb('shell','content','delete','--uri',quote(`${authority}/calendars/${externalId}?caller_is_syncadapter=true&account_name=dolphin-calendar-test&account_type=LOCAL`));
 if(original!==undefined){await state(original);await page.reload();}
 await writeFile(`build/evidence/${version}-android-calendar.json`,JSON.stringify({device:adb('shell','getprop','ro.product.model').trim(),checks,completed:checks.length===10,originalDataRestored:original!==undefined},null,2));
 await device.close();adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');
}
