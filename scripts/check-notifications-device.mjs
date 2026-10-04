import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {_android} from 'playwright';

const serial=process.env.ANDROID_SERIAL;
assert.match(serial??'',/^emulator-\d+$/,'此验证脚本只允许明确指定本任务的模拟器，不操作手机');
const adb=(...args)=>execFileSync('adb',[...(serial?['-s',serial]:[]),...args],{encoding:'utf8',timeout:20000});
const app='com.dolphin.calendar.debug';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const evidencePrefix=process.env.DEVICE_EVIDENCE_PREFIX??`${version}-android`;
const devices=await _android.devices();
const device=serial?devices.find(d=>d.serial()===serial):devices[0];assert.ok(device,'未发现指定 Android 设备');
const webview=await device.webView({pkg:app});const page=await webview.page();
const report={device:adb('shell','getprop','ro.product.model').trim(),sdk:adb('shell','getprop','ro.build.version.sdk').trim(),checks:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
function records(){return adb('shell','cmd','notification','list').trim().split(/\r?\n/).filter(key=>key.includes(`|${app}|`));}
function has(id){return records().some(key=>key.split('|')[2]===String(id));}
function record(id){const key=records().find(key=>key.split('|')[2]===String(id));assert.ok(key,`通知 ${id} 不存在`);assert.match(key,/^[\w|.-]+$/);return adb('shell','cmd','notification','get',`'${key}'`);}
function preference(name){const xml=adb('shell','run-as',app,'cat','shared_prefs/native.xml');const encoded=xml.match(new RegExp(`<string name="${name}">([^<]*)<\\/string>`))?.[1];return encoded?.replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');}
function activeJourney(){const encoded=preference('activeJourney');assert.ok(encoded,'行程状态未保存');return JSON.parse(encoded);}
async function until(check,message,timeout=6000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(check())return;await page.waitForTimeout(150);}throw new Error(message);}
async function store(value){await page.evaluate(value=>new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');if(value)tx.objectStore('state').put(value,'app');else tx.objectStore('state').delete('app');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}),value);}
await mkdir('build/evidence',{recursive:true});
let original;
try{
 original=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>{const db=request.result,r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>{resolve(r.result??null);db.close();};r.onerror=()=>reject(r.error);};request.onerror=()=>reject(request.error);}));
 await mkdir('build/device-backups',{recursive:true});
 await writeFile(`build/device-backups/${evidencePrefix}-${Date.now()}.json`,JSON.stringify(original));
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
 const seeded=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
 seeded.settings={...seeded.settings,notificationsEnabled:true,journeyLive:true,pet:true,poke:true,lines:'测试台词一\n测试台词二',school:'验证大学'};
 const today=new Date(),tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
 const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 seeded.schedule={term:{name:'通知验证',startDate:key(today),weeks:2},periods:[{start:'10:00',end:'10:45'},{start:'10:55',end:'11:40'}],courses:[{id:'native-test',name:'海豚验证课',room:'16栋203号教室',teacher:'测试教师',day:(tomorrow.getDay()+6)%7+1,start:1,end:2,weeks:[1,2],color:'sage',notes:''}]};
 seeded.books={'海豚验证课':{title:'测试教材',publisher:'',edition:''}};
 await store(seeded);await page.reload();
 await until(()=>has(10),'开启桌宠后没有通知');
 assert.match(record(10),/测试台词[一二]/);pass('无行程时显示桌宠，台词为单句');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="notifications"]').click();
 assert.equal(await page.locator('.lyrics-disclosure').getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'模拟导航课程并检查状态',exact:true}).click();
 await until(()=>has(11)&&!has(10),'模拟行程未取代桌宠');
 report.firstSimulation={...activeJourney(),token:preference('journeyToken')};
 assert.equal(report.firstSimulation.endsAt-report.firstSimulation.startedAt,60_000,'首次模拟课程必须只显示一分钟');
 const journey=record(11);assert.match(journey,/海豚验证课/);assert.match(journey,/16栋203号教室/);assert.match(journey,/测试教材/);assert.match(journey,/去16栋203号教室/);assert.match(journey,/我到了/);assert.match(journey,/android.requestPromotedOngoing.*true/);
 assert.doesNotMatch(journey,/android.largeIcon=Icon \(/);
 const apkResources=execFileSync(`${process.env.ANDROID_HOME??'D:/Android/Sdk'}/build-tools/36.0.0/aapt.exe`,['dump','resources','app/build/outputs/apk/debug/app-debug.apk'],{encoding:'utf8'});
 const colorOS=Number(report.sdk)>=36&&['ro.product.manufacturer','ro.product.brand'].some(prop=>/^(oppo|realme|oneplus)$/i.test(adb('shell','getprop',prop).trim()));
 const iconName=colorOS?'live_icon':'ic_notification';
 const liveResource=apkResources.match(new RegExp(`resource (0x[0-9a-f]+) [^\\s]*:drawable/${iconName}:`))[1];
 assert.ok(journey.includes(`icon=Icon(typ=RESOURCE pkg=${app} id=${liveResource})`),'实时图标没有绑定到对应系统的新版品牌资源');
 assert.match(journey,/\[0\] "去16栋203号教室"/);
 assert.match(journey,/android.subText=String \(去16栋203号教室 · 2\/3\)/);
 report.journeyLargeIconRemoved=true;
 report.journeyIcon={type:'RESOURCE',resourceId:liveResource,colorOS,resourceName:iconName,...(colorOS?{width:256,height:256}:{sizeDp:24})};
 report.promoted=/\bPROMOTED_ONGOING\b/.test(journey);
 if(process.env.REQUIRE_PROMOTION==='true')assert.ok(report.promoted,'系统尚未将导航通知提升为实时活动');
 await writeFile(`build/evidence/${evidencePrefix}-journey.txt`,journey);
 pass('行程无左侧大图标，阶段与按钮显示完整教室，桌宠隐藏');
 const request={type:'navigate',url:'https://uri.amap.com/search?keyword='+encodeURIComponent('验证大学 16栋'),courseId:'native-test',title:'海豚验证课',room:'16栋203号教室'};
 await page.evaluate(request=>window.Dolphin.postMessage(JSON.stringify(request)),request);await page.waitForTimeout(300);const firstJourney=activeJourney();
 await page.evaluate(request=>window.Dolphin.postMessage(JSON.stringify(request)),request);await page.waitForTimeout(300);const duplicateJourney=activeJourney();
 assert.equal(duplicateJourney.startedAt,firstJourney.startedAt);assert.equal(duplicateJourney.endsAt,firstJourney.endsAt);assert.equal(duplicateJourney.courseId,'native-test');
 pass('重复开始同一课程导航不重置行程计时或延长过期时间');
 const expired=adb('shell','run-as',app,'/system/bin/am','broadcast','--user','0','-n',`${app}/com.dolphin.calendar.ReminderReceiver`,'-a','com.dolphin.calendar.STOP_JOURNEY','--es','journeyToken','expired-test-token');
 assert.doesNotMatch(expired,/SecurityException|Permission Denial/);await page.waitForTimeout(200);assert.equal(has(11),true);assert.equal(activeJourney().startedAt,firstJourney.startedAt);
 pass('旧行程到达回调不能撤下当前的新导航');
 adb('shell','input','keyevent','3');await page.waitForTimeout(300);
 const resumed=()=>adb('shell','dumpsys','activity','activities').split(/\r?\n/).filter(line=>/mResumedActivity|topResumedActivity/.test(line)).join('\n');
 report.beforeArrival=resumed();assert.doesNotMatch(report.beforeArrival,/com\.dolphin\.calendar.*MainActivity/);
 adb('shell','cmd','statusbar','expand-notifications');await page.waitForTimeout(400);
 await device.wait({text:'我到了',pkg:'com.android.systemui'},{timeout:15000});
 await writeFile(`build/evidence/${evidencePrefix}-notification.png`,execFileSync('adb',[...(serial?['-s',serial]:[]),'exec-out','screencap','-p'],{timeout:20000}));
 await device.tap({text:'我到了',pkg:'com.android.systemui'},{timeout:15000});
 await until(()=>!has(11)&&has(10)&&!has(12),'点我到了没有直接撤下行程，或补发了到达通知');
 await page.waitForTimeout(500);report.afterArrival=resumed();assert.doesNotMatch(report.afterArrival,/com\.dolphin\.calendar.*MainActivity/);
 await writeFile(`build/evidence/${evidencePrefix}-arrival.png`,execFileSync('adb',[...(serial?['-s',serial]:[]),'exec-out','screencap','-p'],{timeout:20000}));
 pass('应用在后台时，实际点“我到了”直接销毁行程、不拉起应用、不补发通知，并恢复桌宠');
 adb('shell','cmd','statusbar','collapse');
 adb('shell','am','start','-n',`${app}/com.dolphin.calendar.MainActivity`);await page.waitForTimeout(400);
 await page.getByRole('button',{name:'发送一条测试通知',exact:true}).click();await until(()=>has(99),'测试提醒未发布');
 await page.locator('#notifications-enabled').uncheck();await until(()=>records().length===0,'关闭总开关后仍有应用通知');
 await page.getByRole('button',{name:'发送一条测试通知',exact:true}).click();await page.waitForTimeout(300);assert.equal(records().length,0);
 pass('关闭总开关撤下全部通知，并禁止新通知');
 await page.locator('#notifications-enabled').check();await until(()=>has(10),'重开总开关未恢复桌宠');
 await page.locator('#journey-live').uncheck();await page.getByRole('button',{name:'模拟导航课程并检查状态',exact:true}).click();await page.waitForTimeout(300);assert.equal(has(11),false);assert.equal(has(10),true);
 pass('单独关闭导航实时状态时不发布行程，小伙伴可继续显示');
 await page.locator('#journey-live').check();await page.getByRole('button',{name:'模拟导航课程并检查状态',exact:true}).click();await until(()=>has(11)&&!has(10),'第二次模拟行程未开始');
 report.lastSimulation={...activeJourney(),token:preference('journeyToken'),settings:JSON.parse(preference('settings'))};
 console.log('SIMULATION '+JSON.stringify(report.lastSimulation));
 assert.equal(report.lastSimulation.endsAt-report.lastSimulation.startedAt,60_000,'第二次模拟课程必须只显示一分钟');
 const expires=Date.now()+70_000;
 while(has(11)&&Date.now()<expires){await page.waitForTimeout(1000);}
 report.afterSimulation={journey:preference('activeJourney'),token:preference('journeyToken'),notifications:records(),settings:JSON.parse(preference('settings'))};
 console.log('AFTER SIMULATION '+JSON.stringify(report.afterSimulation));
 await until(()=>!has(11)&&has(10),'模拟行程超时后桌宠没有恢复');
 pass('约一分钟后模拟行程自动结束并恢复桌宠');
 report.completed=true;
}finally{
 adb('shell','cmd','statusbar','collapse');
 await page.evaluate(()=>window.Dolphin?.postMessage(JSON.stringify({type:'stopJourney'})));
 if(original!==undefined){await store(original);await page.reload();report.originalDataRestored=true;}
 await writeFile(`build/evidence/${evidencePrefix}-notifications.json`,JSON.stringify(report,null,2));await device.close();
 adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');
}
