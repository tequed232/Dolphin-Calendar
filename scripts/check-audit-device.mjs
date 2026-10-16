import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {_android} from 'playwright';
import {pasteJSON} from './check-navigation.mjs';

const serial=process.env.ANDROID_SERIAL,app='com.dolphin.calendar.debug';
assert.match(serial??'',/^emulator-\d+$/,'仅允许指定的隔离模拟器');
const adb=(...args)=>execFileSync(process.env.ADB_PATH??'adb',['-s',serial,...args],{encoding:'utf8',timeout:20000});
assert.equal(adb('shell','getprop','ro.kernel.qemu').trim(),'1');
const device=(await _android.devices()).find(item=>item.serial()===serial);assert.ok(device);
const page=await(await device.webView({pkg:app})).page(),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const decode=value=>value.replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const preferences=()=>{const xml=adb('exec-out','run-as',app,'cat','shared_prefs/native.xml');return {token:decode(xml.match(/<string name="reminderToken">([^<]*)<\/string>/)?.[1]??''),at:Number(xml.match(/<long name="nextReminder" value="(\d+)"/)?.[1]??0)};};
const sync=value=>page.evaluate(value=>window.Dolphin.postMessage(JSON.stringify({type:'sync',...value})),value);
async function until(test){for(let i=0;i<80;i++){if(await test())return;await page.waitForTimeout(100);}throw new Error('未等到原生提醒状态');}
const originalNative=adb('exec-out','run-as',app,'cat','shared_prefs/native.xml');
const original=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result??null);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
await mkdir('build/device-backups',{recursive:true});await mkdir('build/evidence',{recursive:true});
await writeFile('build/device-backups/audit-native-before.xml',originalNative);
const report={serial,sdk:adb('shell','getprop','ro.build.version.sdk').trim(),checks,errors,success:false};
try{
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(item=>/\/Import-[^/]+\.js/.test(item.name))),false);
 await page.evaluate(()=>window.dolphinNative({type:'selectTab',value:'list'}));await page.locator('.screen.active').getByRole('button',{name:'导入课表',exact:true}).click();await pasteJSON(page);
 assert.ok(await page.evaluate(()=>performance.getEntriesByType('resource').some(item=>/\/Import-[^/]+\.js/.test(item.name))));
 await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({courses:[{name:'原生加载测试',day:1,start:1,end:2,weeks:[1]}]}));
 await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('dialog',{name:'确认这份课表',exact:true}).waitFor();
 checks.push('Android内置HTTPS资源按需加载导入模块并正确预览JSON');
 await page.screenshot({path:'build/evidence/audit-native-import.png'});
 const fixture=await page.evaluate(()=>{
  const now=new Date(),start=new Date(now);start.setSeconds(0,0);start.setMinutes(start.getMinutes()+1+(60-now.getSeconds()<7?1:0));
  const end=new Date(start.getTime()+20*60000),clock=date=>`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  const date=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  return {at:start.getTime(),schedule:{term:{name:'原生提醒边界验证',startDate:date,weeks:1},periods:[{start:clock(start),end:clock(end)}],courses:[{id:'audit-imminent',name:'提醒边界验证',day:((start.getDay()+6)%7)+1,start:1,end:1,weeks:[1],specificDate:date,teacher:'',room:'',notes:'',color:'sage'}]},settings:{notificationsEnabled:true,reminders:true,advance:0,journeyLive:false,pet:false,autoUpdate:false},bookTitles:{}};
 });
 await sync(fixture);await until(()=>preferences().token&&preferences().at===fixture.at);const before=preferences();
 await sync({...fixture,bookTitles:{unrelated:'不影响调度的教材更新'}});await page.waitForTimeout(150);assert.deepEqual(preferences(),before);
 checks.push('相同课次的镜像刷新保留原闹钟及批次token');
 console.log('等待下一分钟提醒的700ms边界，最长约一分钟');
 while(fixture.at-await page.evaluate(()=>Date.now())>700)await page.waitForTimeout(Math.min(500,fixture.at-await page.evaluate(()=>Date.now())-700));
 report.remainingBeforeRefresh=fixture.at-await page.evaluate(()=>Date.now());
 await sync(fixture);await page.waitForTimeout(90);assert.deepEqual(preferences(),before);
 checks.push('距离提醒不足1秒再次同步仍保留原批次，不跳过该课程');
 await sync({...fixture,settings:{...fixture.settings,reminders:false}});await until(()=>preferences().at===0&&!preferences().token);
 checks.push('关闭提醒撤销待触发批次及其token');
 assert.deepEqual(errors,[]);report.success=true;
 console.log(checks.map(check=>'PASS '+check).join('\n'));
}catch(error){report.error=error.message;throw error;}finally{
 await page.evaluate(value=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');if(value===null)tx.objectStore('state').delete('app');else tx.objectStore('state').put(value,'app');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}),original);
 await device.close();adb('shell','am','force-stop',app);
 const encoded=Buffer.from(originalNative).toString('base64');adb('shell',`run-as ${app} sh -c 'printf %s ${encoded} | base64 -d > shared_prefs/native.xml'`);
 assert.equal(adb('exec-out','run-as',app,'cat','shared_prefs/native.xml'),originalNative);report.nativeRestored=true;
 await writeFile('build/evidence/audit-device.json',JSON.stringify(report,null,2));
}
