import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {deserialize,serialize} from 'node:v8';
import {_android} from 'playwright';

const serial=process.env.ANDROID_SERIAL;
assert.match(serial??'',/^emulator-\d+$/,'本检查只操作指定 Android 模拟器，请设置 ANDROID_SERIAL');
const app='com.dolphin.calendar.debug',activity=`${app}/com.dolphin.calendar.MainActivity`;
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const prefix=`${version}-android`,stamp=Date.now();
const fixturePath=process.env.BACKGROUND_FIXTURE??'web/src/assets/brand/app-icon.png';
const fixtureName=`dolphin-background-${version}-${stamp}.png`,remote=`/sdcard/Download/${fixtureName}`;
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:25000});
const installed=adb('shell','dumpsys','package',app);
assert.equal(installed.match(/^\s*versionName=(.*)$/m)?.[1].trim(),version,'须先安装本次构建的 debug APK；脚本不会安装旧 APK');
assert.equal(adb('shell','getprop','ro.build.version.sdk').trim(),'36','本次检查要求 Android 16');
await mkdir('build/evidence',{recursive:true});await mkdir('build/device-backups',{recursive:true});
let device=(await _android.devices()).find(item=>item.serial()===serial);assert.ok(device,'指定模拟器未连接');
device.setDefaultTimeout(15000);
const report={version,app,activity,device:serial,model:adb('shell','getprop','ro.product.model').trim(),sdk:36,scope:'隔离 debug 包；原生文件选择和输入法；不操作正式包或实体手机',checks:[],measurements:[],nativePicker:{action:'android.intent.action.OPEN_DOCUMENT',fileName:fixtureName},completed:false};
let page,original,backupPath,pushed=false,primaryError;
function canonical(value,seen=new Map()){
 if(value===null)return ['null'];
 if(typeof value!=='object')return [typeof value,typeof value==='bigint'?String(value):typeof value==='number'?(Object.is(value,-0)?'-0':String(value)):value];
 if(seen.has(value))return ['reference',seen.get(value)];const id=seen.size;seen.set(value,id);
 if(value instanceof Date)return ['date',id,String(value.getTime())];
 if(value instanceof RegExp)return ['regexp',id,value.source,value.flags];
 if(value instanceof ArrayBuffer)return ['buffer',id,Array.from(new Uint8Array(value))];
 if(ArrayBuffer.isView(value))return ['view',id,value.constructor.name,Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))];
 if(value instanceof Map)return ['map',id,Array.from(value,([key,item])=>[canonical(key,seen),canonical(item,seen)])];
 if(value instanceof Set)return ['set',id,Array.from(value,item=>canonical(item,seen))];
 return [Array.isArray(value)?'array':'object',id,Object.keys(value).sort().map(key=>[key,canonical(value[key],seen)])];
}
// V8 的二进制编码会随对象内部布局改变；哈希使用排序并保留类型的规范化结构。
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};

async function snapshot(){return page.evaluate(async()=>{
 const databases=await indexedDB.databases(),result=[];
 for(const info of databases.sort((a,b)=>a.name.localeCompare(b.name))){
  if(!info.name)continue;
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const stores=[];
  for(const name of Array.from(db.objectStoreNames)){
   const entries=await new Promise((resolve,reject)=>{const values=[],r=db.transaction(name).objectStore(name).openCursor();r.onsuccess=()=>{const cursor=r.result;if(cursor){values.push({key:cursor.key,value:cursor.value});cursor.continue();}else resolve(values);};r.onerror=()=>reject(r.error);});
   const store=db.transaction(name).objectStore(name),indexes=Array.from(store.indexNames).map(indexName=>{const index=store.index(indexName);return {name:index.name,keyPath:index.keyPath,multiEntry:index.multiEntry,unique:index.unique};});
   stores.push({name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,entries});
  }
  result.push({name:db.name,version:db.version,stores});db.close();
 }
 return result;
});}
async function restore(){
 await page.evaluate(async databases=>{
  for(const saved of databases){
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(saved.name,saved.version);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   for(const store of saved.stores)await new Promise((resolve,reject)=>{const tx=db.transaction(store.name,'readwrite'),target=tx.objectStore(store.name);target.clear();for(const entry of store.entries){if(target.keyPath===null)target.put(entry.value,entry.key);else target.put(entry.value);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
   db.close();
  }
 },original);
 assert.deepEqual(await snapshot(),original,'恢复后的 IndexedDB 全部数据必须与备份一致');
 await page.reload();await page.locator('.dock').waitFor();
 assert.deepEqual(await snapshot(),original,'恢复后重新加载也必须保留全部 IndexedDB 原值及结构');
 report.restoredDataSha256=digest(await snapshot());assert.equal(report.restoredDataSha256,report.originalDataSha256,'恢复后的原始数据哈希须与二进制备份一致');report.originalDataRestored=true;
}
async function stored(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{db.close();resolve(q.result??null);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));}
async function save(value){await page.evaluate(value=>new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'app');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}),value);}
async function until(check,message,timeout=12000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await page.waitForTimeout(150);}throw new Error(message);}
async function attach(){page=await(await device.webView({pkg:app})).page();page.setDefaultTimeout(15000);await page.locator('.dock').waitFor();await page.locator('.load-note').waitFor({state:'hidden'});}
async function restart(){
 await device.close();
 // force-stop 父应用不会总是移除 DocumentsUI 的结果窗口；先关闭本轮选择器，避免孤立 task 截获后续启动。
 for(let attempt=0;attempt<4;attempt++){
  const activities=adb('shell','dumpsys','activity','activities'),resumed=activities.match(/topResumedActivity=([^\n]+)/)?.[1]??'';
  if(!/com\.(?:google\.)?android\.documentsui/.test(resumed)||!activities.includes(`launchedFromPackage=${app}`))break;
  adb('shell','input','keyevent','4');await new Promise(resolve=>setTimeout(resolve,250));
 }
 adb('shell','am','force-stop',app);adb('shell','am','start','-n',activity);
 const driverInstalled=adb('shell','pm','path','com.microsoft.playwright.androiddriver').trim().startsWith('package:');
 device=(await _android.devices({omitDriverInstall:driverInstalled})).find(item=>item.serial()===serial);assert.ok(device,'重启后指定模拟器须仍连接');device.setDefaultTimeout(15000);await attach();
}
async function backgroundPage(){await nativeTap(page.getByRole('button',{name:'设置',exact:true}));await nativeTap(page.locator('[data-setting="appearance"]'));await nativeTap(page.getByRole('button',{name:/^背景(?:\s|$)/}));await page.locator('#background-blur').waitFor();await page.waitForTimeout(350);}
async function screenshot(suffix){await writeFile(`build/evidence/${prefix}-${suffix}.png`,execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{timeout:25000}));}
async function nativeTap(locator){
 await locator.waitFor({state:'visible'});await locator.evaluate(el=>el.scrollIntoView({block:el.closest('.dock')?'nearest':'center',inline:'nearest',behavior:'instant'}));await page.waitForTimeout(350);
 const box=await locator.boundingBox(),dpr=await page.evaluate(()=>devicePixelRatio);
 assert.ok(box&&box.width>0&&box.height>0,'原生触摸目标必须在 WebView 内可见');
 adb('shell','input','tap',String(Math.round((box.x+box.width/2)*dpr)),String(Math.round((box.y+box.height/2)*dpr)));
}
async function nativeWidgetTap(selector){
 await device.wait(selector,{timeout:15000});await page.waitForTimeout(500);
 let info;
 for(let attempt=0;attempt<4;attempt++)try{info=await device.info(selector);break;}catch(error){if(!String(error).includes('StaleObjectException')||attempt===3)throw error;await page.waitForTimeout(300);}
 assert.ok(info?.bounds.width>0&&info?.bounds.height>0,'系统控件须有可触摸的边界');
 adb('shell','input','tap',String(Math.round(info.bounds.x+info.bounds.width/2)),String(Math.round(info.bounds.y+info.bounds.height/2)));
 return info;
}

try{
 await restart();
 if(process.env.BACKGROUND_RESTORE_BACKUP){original=deserialize(await readFile(process.env.BACKGROUND_RESTORE_BACKUP));report.originalDataSha256=digest(original);await restore();report.recoveryBackup=process.env.BACKGROUND_RESTORE_BACKUP;}
 original=await snapshot();backupPath=`build/device-backups/${prefix}-background-${stamp}.bin`;
 if(report.recoveryBackup)report.recoveryDataRestored=report.originalDataRestored;report.originalDataRestored=false;delete report.restoredDataSha256;
 // V8 序列化保留 undefined 等原值；普通 JSON 会丢掉应用状态中的 undefined 字段。
 await writeFile(backupPath,serialize(original));assert.deepEqual(deserialize(await readFile(backupPath)),original,'恢复备份须完整保留全部原值');
 report.backupPath=backupPath;report.originalDataSha256=digest(original);report.backupStores=original.map(db=>({name:db.name,version:db.version,stores:db.stores.map(store=>({name:store.name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:store.indexes,count:store.entries.length}))}));
 const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible()){await nativeTap(intro);await until(async()=>!!await stored(),'首次引导未完成本地状态保存');await intro.waitFor({state:'hidden'});}
 const seeded=await stored();assert.ok(seeded,'引导完成后应有可备份的本地状态');
 const dates=await page.evaluate(()=>{const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,today=new Date(),tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);return {today:key(today),tomorrow:key(tomorrow),day:(today.getDay()+6)%7+1,tomorrowDay:(tomorrow.getDay()+6)%7+1};});
 seeded.onboarded=true;seeded.settings={...seeded.settings,mode:'light',scale:1,notificationsEnabled:false,reminders:false,pet:false,holidayMarkers:false,backgroundEnabled:false,backgroundBlur:12};delete seeded.background;
 seeded.schedule={term:{name:'原生背景验证',startDate:dates.today,weeks:2},periods:seeded.schedule.periods,courses:[{id:'background-today',name:'今日验证课程',teacher:'测试老师',room:'16栋203号教室',day:dates.day,start:3,end:4,weeks:[1,2],color:'sage',notes:''},{id:'background-tomorrow',name:'明日验证课程',teacher:'测试老师',room:'16栋204号教室',day:dates.tomorrowDay,start:5,end:6,weeks:[1,2],color:'blue',notes:''}]};
 await save(seeded);await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await backgroundPage();
 const exists=spawnSync('adb',['-s',serial,'shell',`test -e ${remote}`],{encoding:'utf8',timeout:20000});assert.equal(exists.status,1,'临时目标必须尚不存在，不覆盖设备上的原文件');
 pushed=true;adb('push',fixturePath,remote);report.nativePicker.fixtureCreated=true;
 // 点击真实 WebView 文件控件，随后只用原生文件应用选择；不使用 setInputFiles。
 await nativeTap(page.locator('.screen.active .file-button'));
 await device.wait({pkg:/com\.(?:google\.)?android\.documentsui/},{timeout:15000});
 await page.waitForTimeout(300);
 const activityDump=adb('shell','dumpsys','activity','activities');assert.match(activityDump,/android\.intent\.action\.OPEN_DOCUMENT/,'必须打开 ACTION_OPEN_DOCUMENT 系统选择器');report.nativePicker.intentEvidence=activityDump.split('\n').filter(line=>line.includes('android.intent.action.OPEN_DOCUMENT')).map(line=>line.trim());
 const picker=await device.info({pkg:/com\.(?:google\.)?android\.documentsui/});report.nativePicker.package=picker.pkg;assert.match(picker.pkg,/^com\.(?:google\.)?android\.documentsui$/,'必须在原生文件选择器中选择');
 report.nativePicker.navigation=await nativeWidgetTap({desc:/Show roots|显示根目录|打开导航栏/i,pkg:picker.pkg});
 report.nativePicker.downloadRoot=await nativeWidgetTap({text:/^(Downloads|Download|下载内容|下载)$/,res:'android:id/title',pkg:picker.pkg});
 // DocumentsUI 默认网格只显示缩略图；列表视图才提供可核对的完整文件名。
 const view=await device.info({desc:/List view|Grid view|列表视图|网格视图/i,pkg:picker.pkg});report.nativePicker.viewMode=view.desc;
 if(/List view|列表视图/i.test(view.desc))report.nativePicker.listView=await nativeWidgetTap({desc:/List view|列表视图|切换到列表/i,pkg:picker.pkg});
 await device.wait({text:fixtureName,pkg:report.nativePicker.package},{timeout:15000});
 report.nativePicker.selectedFile=await device.info({text:fixtureName,pkg:picker.pkg});
 await screenshot('native-document-picker');
 await nativeWidgetTap({text:fixtureName,pkg:report.nativePicker.package});
 await until(async()=>{const data=await stored();return data?.background?.name===fixtureName&&data.settings.backgroundEnabled;},'原生选择器返回后背景未保存');
 await page.locator('.app-background[data-image=true]').waitFor();const chosen=(await stored()).background;
 assert.ok(chosen.width>0&&chosen.height>0&&chosen.url.startsWith('data:image/'));report.image={name:chosen.name,width:chosen.width,height:chosen.height,sourceWidth:chosen.sourceWidth,sourceHeight:chosen.sourceHeight,dataLength:chosen.url.length};
 pass('通过真实 ACTION_OPEN_DOCUMENT 选取 Download 中的 PNG，背景在页面显示并保存');
 const slider=page.locator('#background-blur');await slider.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await page.waitForTimeout(350);
 await slider.evaluate(el=>{window.__backgroundSliderTrace=[];for(const type of ['pointerdown','input','pointerup','change'])el.addEventListener(type,event=>window.__backgroundSliderTrace.push({type,eventTrusted:event.isTrusted,value:Number(el.value)}));});
 const box=await slider.boundingBox(),sliderDock=await page.locator('.dock').boundingBox(),dpr=await page.evaluate(()=>devicePixelRatio),position=value=>[Math.round((box.x+14+(box.width-28)*value/30)*dpr),Math.round((box.y+box.height/2)*dpr)];
 report.sliderGeometry={slider:box,dock:sliderDock};assert.ok(box.y+box.height/2<sliderDock.y-10,'滑块触摸位置必须在Dock上方');
 adb('shell','input','swipe',...position(12).map(String),...position(24).map(String),'700');
 await until(async()=>{const data=await stored();return data.settings.backgroundBlur>=22&&data.settings.backgroundBlur<=26;},'真实触摸滑块未保存模糊值');
 const blur=(await stored()).settings.backgroundBlur,trace=await page.evaluate(()=>window.__backgroundSliderTrace);assert.ok(trace.some(event=>event.type==='pointerup'&&event.eventTrusted),'滑块必须收到原生触摸的可信松手事件');assert.equal(await page.locator('.background-photo').evaluate(el=>getComputedStyle(el).filter),`blur(${blur}px)`);report.nativeSlider={value:blur,gesture:'adb input swipe',pointerReleased:true,trace};
 pass('Android 原生触摸拖动毛玻璃滑块，松手保存对应模糊效果');
 await nativeTap(page.getByRole('button',{name:'首页',exact:true}));await page.waitForTimeout(350);
 const backgroundRead=()=>page.locator('.background-photo').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,filter:getComputedStyle(el).filter};});
 const before=await backgroundRead(),screen=page.locator('.screen.active'),scrollBefore=await screen.evaluate(el=>el.scrollTop),screenBox=await screen.boundingBox(),scrollDock=await page.locator('.dock').boundingBox(),scrollStart=Math.min(screenBox.y+screenBox.height-70,scrollDock.y-24);
 adb('shell','input','swipe',String(Math.round((screenBox.x+screenBox.width/2)*dpr)),String(Math.round(scrollStart*dpr)),String(Math.round((screenBox.x+screenBox.width/2)*dpr)),String(Math.round((screenBox.y+70)*dpr)),'600');await page.waitForTimeout(350);
 const scrollAfter=await screen.evaluate(el=>el.scrollTop);assert.ok(scrollAfter>scrollBefore+50,'真实 Android 手势须实际滚动课程页面');assert.deepEqual(await backgroundRead(),before);report.nativeScroll={before:scrollBefore,after:scrollAfter,gesture:'adb input swipe'};await screen.evaluate(el=>el.scrollTop=0);pass('真实 Android 页面滚动时自定义背景固定在视口');
 await restart();
 await page.locator('.app-background[data-image=true]').waitFor();assert.deepEqual((await stored()).background,chosen);assert.equal((await stored()).settings.backgroundBlur,blur);assert.equal(await page.locator('.background-photo').evaluate(el=>getComputedStyle(el).filter),`blur(${blur}px)`);pass('强制停止后冷启动，图片与毛玻璃值保持不变');
 await nativeTap(page.getByRole('button',{name:'选择日期',exact:true}));await page.locator('dialog[open] .calendar-grid').waitFor();await page.waitForTimeout(350);assert.equal(await page.locator('dialog[open] .calendar-day').count(),42);
 await page.waitForFunction(()=>{const dialog=document.querySelector('dialog[open]');return dialog&&getComputedStyle(dialog).opacity==='1'&&dialog.getAnimations({subtree:true}).every(animation=>animation.playState!=='running');});await screenshot('calendar-picker');await nativeTap(page.getByRole('button',{name:new RegExp(`^${dates.tomorrow}，`)}));await page.locator('.screen.active .course-card').first().waitFor();assert.match(await page.locator('.screen.active .timetable').innerText(),/明日验证课程/);assert.equal(await page.locator('dialog[open]').count(),0);
 report.nativeCalendar={gesture:'adb input tap',selectedDate:dates.tomorrow,course:'明日验证课程'};await nativeTap(page.getByRole('button',{name:'回到今天',exact:true}));assert.match(await page.locator('.screen.active .timetable').innerText(),/今日验证课程/);pass('原生 WebView 的应用月历可选日期刷新课程，返回今天保持一致');
 await nativeTap(page.getByRole('button',{name:'设置',exact:true}));await nativeTap(page.locator('[data-setting="navigation"]'));
 const input=page.getByPlaceholder('例如：浙江大学紫金港校区');await input.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));await page.waitForTimeout(350);
 const measurement=()=>page.evaluate(()=>{const css=getComputedStyle(document.documentElement),rect=el=>el.getBoundingClientRect().toJSON();return {dock:rect(document.querySelector('.dock')),host:rect(document.querySelector('.screen-host')),input:rect(document.activeElement),height:parseFloat(css.getPropertyValue('--native-height')),keyboard:parseFloat(css.getPropertyValue('--keyboard-height')),bottom:css.getPropertyValue('--native-bottom'),dpr:devicePixelRatio};});
 const keyboardBefore=await measurement(),inputBox=await input.boundingBox();adb('shell','input','tap',String(Math.round((inputBox.x+inputBox.width/2)*keyboardBefore.dpr)),String(Math.round((inputBox.y+inputBox.height/2)*keyboardBefore.dpr)));
 await page.waitForFunction(()=>document.documentElement.dataset.keyboard==='true');await page.waitForTimeout(350);assert.match(adb('shell','dumpsys','input_method'),/mInputShown=true/);const keyboardOpen=await measurement();assert.ok(keyboardOpen.keyboard>100);assert.ok(Math.abs(keyboardOpen.dock.y-keyboardBefore.dock.y)<1);assert.equal(keyboardOpen.bottom,keyboardBefore.bottom);assert.ok(keyboardOpen.input.bottom<=keyboardOpen.height-keyboardOpen.keyboard+1);
 await screenshot('background-keyboard');
 adb('shell','input','keyevent','4');await page.waitForFunction(()=>document.documentElement.dataset.keyboard==='false');const keyboardClosed=await measurement();assert.ok(Math.abs(keyboardClosed.dock.y-keyboardBefore.dock.y)<1);report.measurements.push({label:'自定义背景下真实输入法与固定 Dock',before:keyboardBefore,open:keyboardOpen,closed:keyboardClosed});pass('真实 Android 输入法弹出和关闭，Dock 不上浮且输入框可见');
 await nativeTap(page.getByRole('button',{name:'首页',exact:true}));await page.waitForTimeout(500);await screenshot('background');report.completed=true;
}catch(error){primaryError=error;report.error=String(error.stack??error);console.error(report.error);try{report.failureSliderTrace=await page.evaluate(()=>window.__backgroundSliderTrace);await screenshot('background-failure');}catch{}
}finally{
 try{
  if(original){await restart();await restore();}
 }catch(error){report.restoreError=String(error.stack??error);primaryError??=error;}
 if(pushed){try{adb('shell','rm','--',remote);report.nativePicker.fixtureRemoved=true;}catch(error){report.cleanupError=String(error);primaryError??=error;}}
 report.completed=report.completed&&!primaryError&&!!report.originalDataRestored&&!!report.nativePicker.fixtureRemoved;
 await writeFile(`build/evidence/${prefix}-background.json`,JSON.stringify(report,null,2));
 try{await device.close();adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');}catch(error){console.error('Playwright 连接清理失败：'+String(error));}
}
if(primaryError)throw primaryError;
