import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {serialize,deserialize} from 'node:v8';
import {_android} from 'playwright';

// This script never installs or replaces a Dolphin APK. Run it after the current debug build is installed.
// Every adb command is pinned to an explicitly named emulator and the debug package.
const serial=process.env.ANDROID_SERIAL;
assert.match(serial??'',/^emulator-\d+$/,'节假日验证只操作明确指定的 Android 模拟器，请设置 ANDROID_SERIAL');
const app='com.dolphin.calendar.debug',activity=`${app}/com.dolphin.calendar.MainActivity`;
// Keep the unique title suffix free of "holiday"/"festival" so fixtures do not classify themselves.
const authority='content://com.android.calendar',token=`dolphin-provider-${randomUUID()}`;
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:25000});
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
const shell=(...args)=>adb('shell',args.map(quote).join(' '));
assert.equal(adb('get-state').trim(),'device','指定模拟器必须已连接');
assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1','此验证必须在模拟器内执行');
assert.ok(shell('dumpsys','package',app).includes(`versionName=${version}`),'先安装本次构建的隔离 debug APK；脚本不会安装或降级 APK');
await mkdir('build/evidence',{recursive:true});await mkdir('build/device-backups',{recursive:true});
const evidence=`build/evidence/${version}-android-holidays.json`,journal=`build/device-backups/${token}-provider.json`;
const report={version,device:serial,model:shell('getprop','ro.product.model').trim(),token,scope:'指定模拟器的隔离 debug 包；仅精确删除本次生成 ID 的临时本地日历与事件',checks:[],results:[],createdCalendars:[],createdEvents:[],completed:false};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const hash=value=>createHash('sha256').update(value).digest('hex');
let device=(await _android.devices()).find(item=>item.serial()===serial);assert.ok(device,'指定模拟器未出现在 Playwright Android 设备列表');
let page,original,primaryError,backupPath;
const initialPermission=shell('dumpsys','package',app).match(/READ_CALENDAR: granted=(true|false)/)?.[1]==='true';
const initialWrite=shell('dumpsys','package',app).match(/WRITE_CALENDAR: granted=(true|false)/)?.[1]==='true';
const permissionFlags=shell('dumpsys','package',app).match(/READ_CALENDAR: granted=(?:true|false), flags=\[([^\]]*)\]/)?.[1]??'';
const writeFlags=shell('dumpsys','package',app).match(/WRITE_CALENDAR: granted=(?:true|false), flags=\[([^\]]*)\]/)?.[1]??'';
const originalUserFlags=['USER_SET','USER_FIXED'].filter(flag=>permissionFlags.includes(flag)),originalWriteFlags=['USER_SET','USER_FIXED'].filter(flag=>writeFlags.includes(flag));
function provider(table,projection,where){return shell('content','query','--uri',`${authority}/${table}`,'--projection',projection,...(where?['--where',where]:[])).replaceAll('\r\n','\n');}
function syncUri(table,id,account){return `${authority}/${table}/${id}?caller_is_syncadapter=true&account_name=${encodeURIComponent(account)}&account_type=LOCAL`;}
async function persistJournal(){await writeFile(journal,JSON.stringify({token,serial,package:app,calendars:report.createdCalendars,events:report.createdEvents,backupPath,originalReadPermission:initialPermission,originalWritePermission:initialWrite,originalUserFlags,originalWriteFlags},null,2));}
async function calendar(label,{visible=true,account=token}={}){
 const name=`${token}-${label}`,uri=`${authority}/calendars?caller_is_syncadapter=true&account_name=${encodeURIComponent(account)}&account_type=LOCAL`;
 shell('content','insert','--uri',uri,'--bind',`account_name:s:${account}`,'--bind','account_type:s:LOCAL','--bind',`name:s:${name}`,'--bind',`calendar_displayName:s:${label} Holiday ${token}`,'--bind','calendar_access_level:i:700','--bind',`ownerAccount:s:${account}`,'--bind',`visible:i:${visible?1:0}`,'--bind','sync_events:i:1','--bind','calendar_timezone:s:UTC');
 const rows=provider('calendars','_id:name:account_name',`name='${name}' AND account_name='${account}' AND account_type='LOCAL'`),ids=[...rows.matchAll(/_id=(\d+)/g)].map(match=>match[1]);
 assert.equal(ids.length,1,'临时日历必须唯一，不能使用其他账号的日历 ID');
 const saved={id:ids[0],name,account};report.createdCalendars.push(saved);await persistJournal();return saved;
}
async function event(calendar,title,start,end,{allDay=true,rrule,status}={}){
 const description=`${token}-event-${randomUUID()}`;
 const eventZone=allDay?'UTC':/^[+-]\d{2}:\d{2}$/.test(report.timezone)?`GMT${report.timezone.replace(':','')}`:report.timezone;
 const args=['content','insert','--uri',`${authority}/events`,'--bind',`calendar_id:l:${calendar.id}`,'--bind',`title:s:${title} [${token}]`,'--bind',`description:s:${description}`,'--bind',`dtstart:l:${start}`,'--bind',`allDay:i:${allDay?1:0}`,'--bind',`eventTimezone:s:${eventZone}`];
 if(rrule)args.push('--bind',`duration:s:${allDay?'P1D':'PT1H'}`,'--bind',`rrule:s:${rrule}`);else args.push('--bind',`dtend:l:${end}`);
 if(status!==undefined)args.push('--bind',`eventStatus:i:${status}`);
 const inserted=shell(...args);
 const rows=provider('events','_id:calendar_id:description',`calendar_id=${calendar.id} AND description='${description}'`),ids=[...rows.matchAll(/(?:^|[ ,])_id=(\d+)/g)].map(match=>match[1]);assert.equal(ids.length,1,`临时事件必须唯一：${title}；${inserted}；${rows}`);
 const saved={id:ids[0],calendarId:calendar.id,account:calendar.account,description,title};report.createdEvents.push(saved);await persistJournal();return saved;
}
async function stored(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{db.close();resolve(q.result??null);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));}
async function saveState(value){await page.evaluate(value=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'app');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}),value);}
async function snapshot(){return page.evaluate(async()=>{
 const databases=await indexedDB.databases(),result=[];
 for(const info of databases.sort((a,b)=>a.name.localeCompare(b.name))){if(!info.name)continue;
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),stores=[];
  for(const name of Array.from(db.objectStoreNames)){const entries=await new Promise((resolve,reject)=>{const values=[],r=db.transaction(name).objectStore(name).openCursor();r.onsuccess=()=>{const cursor=r.result;if(cursor){values.push({key:cursor.key,value:cursor.value});cursor.continue();}else resolve(values);};r.onerror=()=>reject(r.error);});stores.push({name,entries});}
  result.push({name:db.name,version:db.version,stores});db.close();
 }
 return {databases:result,localStorage:Object.fromEntries(Object.entries(localStorage))};
});}
async function restore(){
 await page.evaluate(async saved=>{
  for(const database of saved.databases){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database.name,database.version);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   for(const store of database.stores)await new Promise((resolve,reject)=>{const tx=db.transaction(store.name,'readwrite'),target=tx.objectStore(store.name);target.clear();for(const entry of store.entries){if(target.keyPath===null)target.put(entry.value,entry.key);else target.put(entry.value);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();
  }
  localStorage.clear();for(const [key,value]of Object.entries(saved.localStorage))localStorage.setItem(key,value);
 },original);
 assert.deepEqual(await snapshot(),original,'全部 IndexedDB 与 localStorage 必须精确恢复到测试前');report.originalDataRestored=true;
 assert.equal(hash(await readFile(backupPath)),report.originalSha256,'持久化 V8 备份文件不能改变');report.backupIntegrityVerified=true;
 await page.reload();await page.locator('.dock').waitFor();
}
async function attach(){page=await(await device.webView({pkg:app})).page();page.setDefaultTimeout(15000);await page.locator('.dock').waitFor();await page.locator('.load-note').waitFor({state:'hidden'});await recordNative();}
async function restart(){
 await device.close();
 // Close only a stale DocumentsUI result task launched by this debug package.
 for(let attempt=0;attempt<4;attempt++){const activities=shell('dumpsys','activity','activities'),resumed=activities.match(/topResumedActivity=([^\n]+)/)?.[1]??'';if(!/com\.(?:google\.)?android\.documentsui/.test(resumed)||!activities.includes(`launchedFromPackage=${app}`))break;shell('input','keyevent','4');await new Promise(resolve=>setTimeout(resolve,250));}
 shell('am','force-stop',app);shell('am','start','-f','0x10008000','-n',activity);
 const driverInstalled=shell('pm','path','com.microsoft.playwright.androiddriver').trim().startsWith('package:');
 device=(await _android.devices({omitDriverInstall:driverInstalled})).find(item=>item.serial()===serial);assert.ok(device,'重启后指定模拟器必须仍连接');device.setDefaultTimeout(15000);await attach();
}
async function recordNative(){await page.evaluate(()=>{
 if(window.__holidayRecorder)return;window.__holidayRecorder=true;window.__holidayResults=[];
 const original=window.dolphinNative;window.dolphinNative=message=>{if(message.type==='holidayResult')window.__holidayResults.push(message);original?.(message);};
});}
async function startRequest(action,payload={}){return page.evaluate(({action,payload})=>{const cursor=window.__holidayResults.length;window.Dolphin.postMessage(JSON.stringify({type:action,...payload}));return cursor;},{action,payload});}
async function response(action,cursor){await page.waitForFunction(({action,cursor})=>window.__holidayResults.slice(cursor).some(item=>item.action===action),{action,cursor},{timeout:20000});const result=await page.evaluate(({action,cursor})=>window.__holidayResults.slice(cursor).find(item=>item.action===action),{action,cursor});report.results.push(result);return result;}
async function request(action,payload={}){return response(action,await startRequest(action,payload));}
function dateAt(base,offset){return new Date(base+offset*86400000).toISOString().slice(0,10);}
function clearReadFlags(){shell('pm','clear-permission-flags',app,'android.permission.READ_CALENDAR','user-set','user-fixed');}
async function tap(locator){
 await locator.waitFor({state:'visible'});await locator.evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await page.waitForTimeout(350);
 const box=await locator.evaluate(element=>{const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,width:rect.width,height:rect.height,dpr:devicePixelRatio,viewportWidth:innerWidth,viewportHeight:innerHeight};});
 assert.ok(box.width>0&&box.height>0&&box.x>=0&&box.y>=0&&box.x<box.viewportWidth&&box.y<box.viewportHeight,'原生触摸必须落在当前可见控件内');
 shell('input','tap',Math.round(box.x*box.dpr),Math.round(box.y*box.dpr));await page.waitForTimeout(200);
}
async function dialogReady(){await page.waitForFunction(()=>{const dialog=document.querySelector('dialog[open]');return dialog&&getComputedStyle(dialog).opacity==='1'&&dialog.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).every(animation=>['finished','idle'].includes(animation.playState));},{},{timeout:15000});}
async function holidayPage(){await tap(page.getByRole('button',{name:'设置',exact:true}));await tap(page.locator('[data-setting="home-settings"]'));await tap(page.getByRole('button',{name:/^节假日标记(?:\s|$)/}));await page.locator('[data-action="holiday-calendars"]').waitFor();}
// Ignore only this version's holiday toggle and authorized appearance schema additions/removal.
// All course/book values, reminders, school, map, mode and other prior preferences must stay exact.
function courseData(data){const settings=structuredClone(data.settings);for(const key of ['holidayMarkers','backgroundEnabled','backgroundBlur','contour'])delete settings[key];return {schedule:data.schedule,books:data.books,settings};}
async function screenshot(){await writeFile(`build/evidence/${version}-holidays-android.png`,execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{timeout:25000}));}

try{
 await restart();
 if(process.env.HOLIDAYS_RESTORE_BACKUP){backupPath=process.env.HOLIDAYS_RESTORE_BACKUP;const recovery=await readFile(backupPath);original=deserialize(recovery);report.originalSha256=hash(recovery);await restore();report.recoveryBackup=backupPath;report.recoveryDataRestored=report.originalDataRestored;report.originalDataRestored=false;delete report.backupIntegrityVerified;}
 original=await snapshot();backupPath=`build/device-backups/${token}-state.v8`;await writeFile(backupPath,serialize(original));assert.deepEqual(deserialize(await readFile(backupPath)),original,'持久化备份必须保留 undefined 等全部原始值');await writeFile(backupPath.replace(/\.v8$/,'.json'),JSON.stringify(original));report.originalSha256=hash(await readFile(backupPath));report.backupPath=backupPath;await persistJournal();
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await tap(intro);
 const untouched=await stored();assert.ok(untouched);const courseState=courseData(untouched);
 const seeded={...untouched,holidayCalendarIds:[],holidaySourceNames:[],holidayRanges:[],holidays:[],settings:{...untouched.settings,holidayMarkers:true}};await saveState(seeded);await page.reload();await recordNative();
 const dates=await page.evaluate(()=>{const today=new Date(),year=today.getFullYear(),month=today.getMonth();return {year,base:Date.UTC(year,month,3),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};});report.timezone=dates.timezone;
 const from=`${dates.year}-01-01`,to=`${dates.year}-12-31`,base=dates.base;
 // Clear both calendar permissions only in the debug test fixture so a previously granted
 // calendar write group cannot bypass the actual read permission dialog. The app requests READ alone.
 shell('pm','revoke',app,'android.permission.WRITE_CALENDAR');shell('pm','clear-permission-flags',app,'android.permission.WRITE_CALENDAR','user-set','user-fixed');
 shell('pm','revoke',app,'android.permission.READ_CALENDAR');clearReadFlags();
 // Android may kill the app when a runtime permission is revoked; reattach to the new WebView.
 await restart();
 const deniedCursor=await startRequest('holidayCalendars');await device.tap({res:'com.android.permissioncontroller:id/permission_deny_button'},{timeout:15000});
 const denied=await response('holidayCalendars',deniedCursor);assert.equal(denied.success,false);assert.equal(denied.permission,false);assert.equal('calendars'in denied,false);assert.equal('days'in denied,false);
 assert.equal(/WRITE_CALENDAR: granted=true/.test(shell('dumpsys','package',app)),false);pass('原生拒绝 READ_CALENDAR 返回明确失败，节假日查询不申请 WRITE_CALENDAR');
 clearReadFlags();const allowedCursor=await startRequest('holidayCalendars');await device.tap({res:'com.android.permissioncontroller:id/permission_allow_button'},{timeout:15000});const allowed=await response('holidayCalendars',allowedCursor);assert.equal(allowed.success,true);assert.equal(allowed.permission,true);
 assert.equal(/WRITE_CALENDAR: granted=true/.test(shell('dumpsys','package',app)),false,'节假日来源读取获准后 WRITE_CALENDAR 仍须未授予');
 const selected=await calendar('Selected'),other=await calendar('Unselected'),hidden=await calendar('Hidden',{visible:false}),owned=await calendar('Owned',{account:app});
 await event(selected,'国庆节 放假',base,base+3*86400000);
 await event(selected,'国庆节 放假',base,base+3*86400000); // Duplicate provider entries produce one marker per title/date/source.
 await event(selected,'调休上班',base+3*86400000,base+4*86400000);
 await event(selected,'国庆节',base+4*86400000,base+5*86400000);
 await event(selected,'补班',base+6*86400000,undefined,{rrule:'FREQ=WEEKLY;COUNT=3'});
 await event(selected,'春节补课',base+22*86400000,base+23*86400000);
 await event(selected,'国庆节补课',base+23*86400000,base+24*86400000);
 await event(selected,'国庆节（班）',base+24*86400000,base+25*86400000);
 await event(selected,'补课',base+25*86400000,base+26*86400000);
 for(const title of ['项目会议','国庆节策划会议','休斯顿会议','补习课程','工作日例会','补课讨论会','不补课','休息室会议','取消放假','不放假','不补班','取消补课','补课取消','取消上班安排','上班安排取消'])await event(selected,title,base+5*86400000,base+6*86400000);
 await event(selected,'放假取消',base+5*86400000,base+6*86400000,{status:2});
 await event(other,'未选中来源 放假',base+5*86400000,base+6*86400000);
 await event(hidden,'隐藏来源 放假',base+5*86400000,base+6*86400000);
 await event(owned,'Dolphin自有来源 放假',base+5*86400000,base+6*86400000);
 const timed=await page.evaluate(base=>{const date=new Date(base+26*86400000),start=new Date(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),23,30),end=new Date(start);end.setMinutes(end.getMinutes()+60);return {start:start.getTime(),end:end.getTime()};},base);
 await event(selected,'day off',timed.start,timed.end,{allDay:false});
 const sources=await request('holidayCalendars');assert.equal(sources.success,true);assert.ok(sources.calendars.some(item=>item.id===selected.id&&item.isSuggested));assert.ok(sources.calendars.some(item=>item.id===other.id));assert.ok(!sources.calendars.some(item=>item.id===hidden.id||item.id===owned.id));pass('Calendar Provider 来源仅列可见外部日历，隐藏来源与 Dolphin 自建日历被排除');
 const payload={calendarIds:[selected.id],from,to},result=await request('calendarHolidays',payload);assert.equal(result.success,true,JSON.stringify(result));assert.deepEqual(result.calendarIds,[selected.id]);assert.equal(result.from,from);assert.equal(result.to,to);
 const marks=result.days,expected=[...Array.from({length:3},(_,offset)=>({date:dateAt(base,offset),kind:'rest'})),{date:dateAt(base,3),kind:'makeup'},{date:dateAt(base,4),kind:'festival'},...[6,13,20,22,23,24,25].map(offset=>({date:dateAt(base,offset),kind:'makeup'})),...[26,27].map(offset=>({date:dateAt(base,offset),kind:'rest'}))];
 assert.deepEqual(marks.map(({date,kind})=>({date,kind})).sort((a,b)=>a.date.localeCompare(b.date)),expected.sort((a,b)=>a.date.localeCompare(b.date)));assert.ok(marks.every(item=>item.source.includes('Selected')));
 pass('真实 Instances 展开三次重复补班；全天跨多日按 UTC 与排他结束时间，重复条目去重，跨午夜定时休假按本地日期');pass('补课、春节补课、国庆节补课与国庆节（班）标补；普通会议、补课讨论会、不补课、休息室会议及取消补课/上班不误判，未选来源与取消事件不进入结果');
 const narrow=await request('calendarHolidays',{calendarIds:[selected.id],from:dateAt(base,1),to:dateAt(base,1)});assert.equal(narrow.success,true);assert.equal(narrow.days.length,1);assert.equal(narrow.days[0].date,dateAt(base,1));pass('查询两端日期均包含，跨范围事件只返回范围内当天');
 for(const invalid of [{calendarIds:[selected.id],from:`${dates.year-1}-01-01`,to},{calendarIds:[selected.id],from:to,to:from},{calendarIds:[hidden.id],from,to},{calendarIds:[owned.id],from,to},{calendarIds:[],from,to}]){const failure=await request('calendarHolidays',invalid);assert.equal(failure.success,false);assert.equal('days'in failure,false);}
 pass('超过 366 天、倒序、隐藏或自有来源、空选择均明确失败且不返回空缓存');
 // The UI validates explicit source selection and rendering using the same real provider data.
 await holidayPage();await tap(page.locator('[data-action="holiday-calendars"]'));await page.locator(`[data-calendar-id="${selected.id}"]`).waitFor();
 assert.equal(await page.locator('.holiday-source-list input:checked').count(),0,'建议来源不能被自动选中');
 await tap(page.locator(`[data-calendar-id="${selected.id}"]`));await page.waitForFunction(id=>document.querySelector(`[data-calendar-id="${id}"]`)?.checked,selected.id);await tap(page.locator('[data-action="holiday-save-sources"]'));
 await page.waitForFunction(()=>document.querySelector('.holiday-source-summary')?.textContent?.includes('Selected'));
 assert.equal(await page.locator('[aria-label="节假日年份"]').inputValue(),String(dates.year));const refreshCursor=await page.evaluate(()=>window.__holidayResults.length);await tap(page.locator('[data-action="holiday-refresh"]'));
 assert.equal((await response('calendarHolidays',refreshCursor)).success,true);await page.locator('.holiday-status').filter({hasText:'已读取'}).waitFor();
 const cached=await stored();assert.deepEqual(cached.holidayCalendarIds,[selected.id]);assert.ok(cached.holidays.length>0);const cachedBefore={days:structuredClone(cached.holidays),ranges:structuredClone(cached.holidayRanges),ids:[...cached.holidayCalendarIds]};
 await tap(page.getByRole('button',{name:'首页',exact:true}));await tap(page.getByRole('button',{name:'选择日期',exact:true}));await dialogReady();
 for(const [offset,kind,label]of [[0,'rest','休'],[3,'makeup','补'],[4,'festival','节']]){const mark=page.locator(`.calendar-day[data-date="${dateAt(base,offset)}"]`);assert.ok(await mark.evaluate((el,kind)=>el.classList.contains(`holiday-${kind}`),kind));assert.equal(await mark.locator('b.holiday-mark').innerText(),label);}
 await dialogReady();await screenshot();await tap(page.getByRole('button',{name:'关闭对话框',exact:true}));
 const stripDate=dateAt(base,3);await tap(page.getByRole('button',{name:'选择日期',exact:true}));await dialogReady();await tap(page.locator(`.calendar-day[data-date="${stripDate}"]`));assert.equal(await page.locator(`.date-item[data-date="${stripDate}"] b.holiday-mark`).innerText(),'补');pass('用户实际勾选来源后，日期条与月历显示真实日历的休、补、节标记');
 shell('pm','revoke',app,'android.permission.READ_CALENDAR');clearReadFlags();await restart();await holidayPage();
 const deniedRefreshCursor=await page.evaluate(()=>window.__holidayResults.length);await tap(page.locator('[data-action="holiday-refresh"]'));await device.tap({res:'com.android.permissioncontroller:id/permission_deny_button'},{timeout:15000});
 assert.equal((await response('calendarHolidays',deniedRefreshCursor)).success,false);await page.locator('.holiday-status.error').waitFor();const afterDenial=await stored();assert.deepEqual({days:afterDenial.holidays,ranges:afterDenial.holidayRanges,ids:afterDenial.holidayCalendarIds},cachedBefore);pass('真实权限拒绝刷新后保留上次成功读取的全部节假日缓存');
 shell('pm','grant',app,'android.permission.READ_CALENDAR');
 for(let index=0;index<7;index++)await event(selected,`放假 多标记${index}`,Date.parse(`${from}T00:00:00Z`),Date.parse(`${dates.year+1}-01-01T00:00:00Z`));
 const tooManyCursor=await page.evaluate(()=>window.__holidayResults.length);await tap(page.locator('[data-action="holiday-refresh"]'));const tooMany=await response('calendarHolidays',tooManyCursor);assert.equal(tooMany.success,false);assert.match(tooMany.message,/2000/);assert.equal('days'in tooMany,false);await page.locator('.holiday-status.error').filter({hasText:'2000'}).waitFor();const afterLimit=await stored();assert.deepEqual({days:afterLimit.holidays,ranges:afterLimit.holidayRanges,ids:afterLimit.holidayCalendarIds},cachedBefore);pass('真实 provider 超过 2000 个日期标记后完整失败，保留旧缓存且不交付部分数据');
 const after=await stored();assert.deepEqual(courseData(after),courseState,'读取节假日不能改动课表、教材或提醒设置');pass('节假日读取未改动课表、教材与原有提醒设置');report.completed=true;
}catch(error){primaryError=error;report.error=String(error.stack??error);console.error(report.error);
}finally{
 // Delete only IDs generated by this run, after validating their unique identity.
 const cleanupErrors=[];
 for(const event of [...report.createdEvents].reverse())try{const row=provider('events','_id:calendar_id:description',`_id=${event.id}`);if(!row.includes('No result found.')){assert.ok(row.includes(`description=${event.description}`)&&row.includes(`calendar_id=${event.calendarId}`),'拒绝删除身份不匹配的事件');shell('content','delete','--uri',syncUri('events',event.id,event.account));}}catch(error){cleanupErrors.push(String(error));}
 for(const calendar of [...report.createdCalendars].reverse())try{const row=provider('calendars','_id:name:account_name',`_id=${calendar.id}`);if(!row.includes('No result found.')){assert.ok(row.includes(`name=${calendar.name}`)&&row.includes(`account_name=${calendar.account}`),'拒绝删除身份不匹配的日历');shell('content','delete','--uri',syncUri('calendars',calendar.id,calendar.account));}assert.ok(!provider('calendars','_id',`_id=${calendar.id}`).includes(`_id=${calendar.id}`),'临时日历删除未完成');}catch(error){cleanupErrors.push(String(error));}
 report.providerFixturesRemoved=cleanupErrors.length===0;if(cleanupErrors.length){report.cleanupErrors=cleanupErrors;primaryError??=new Error(cleanupErrors.join('\n'));}
 try{await restart();if(original)await restore();}catch(error){report.restoreError=String(error.stack??error);primaryError??=error;}
 try{shell('pm',initialPermission?'grant':'revoke',app,'android.permission.READ_CALENDAR');clearReadFlags();for(const flag of originalUserFlags)shell('pm','set-permission-flags',app,'android.permission.READ_CALENDAR',flag.toLowerCase().replaceAll('_','-'));shell('pm',initialWrite?'grant':'revoke',app,'android.permission.WRITE_CALENDAR');shell('pm','clear-permission-flags',app,'android.permission.WRITE_CALENDAR','user-set','user-fixed');for(const flag of originalWriteFlags)shell('pm','set-permission-flags',app,'android.permission.WRITE_CALENDAR',flag.toLowerCase().replaceAll('_','-'));assert.equal(/WRITE_CALENDAR: granted=true/.test(shell('dumpsys','package',app)),initialWrite,'测试须恢复写日历权限');assert.equal(/READ_CALENDAR: granted=true/.test(shell('dumpsys','package',app)),initialPermission,'测试须恢复读日历权限');report.originalPermissionRestored=true;}catch(error){report.permissionRestoreError=String(error);primaryError??=error;}
 report.completed=report.completed&&!primaryError&&!!report.originalDataRestored&&!!report.providerFixturesRemoved&&!!report.originalPermissionRestored;
 await persistJournal();await writeFile(evidence,JSON.stringify(report,null,2));await device.close();
}
if(primaryError)throw primaryError;
