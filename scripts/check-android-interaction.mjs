import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {serialize,deserialize} from 'node:v8';
import {_android} from 'playwright';

const serial=process.env.ANDROID_SERIAL,app='com.dolphin.calendar.debug',activity=`${app}/com.dolphin.calendar.MainActivity`;
assert.match(serial??'',/^emulator-\d+$/,'只操作明确指定的模拟器和隔离 debug 包');
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1],prefix=`${version}-android`,apk='app/build/outputs/apk/debug/app-debug.apk';
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:25000});
const apkSha256=createHash('sha256').update(await readFile(apk)).digest('hex');
const report={version,serial,app,apkSha256,model:adb('shell','getprop','ro.product.model').trim(),sdk:adb('shell','getprop','ro.build.version.sdk').trim(),scope:'本任务模拟器上的隔离 debug 包；备份并还原全部 IndexedDB 和 localStorage；不操作正式包或手机',checks:[],completed:false};
await mkdir('build/device-backups',{recursive:true});await mkdir('build/evidence',{recursive:true});
const backupPath=`build/device-backups/${prefix}-interaction-${Date.now()}.v8`;
let device,page,original,firstError;
async function attach(){device=(await _android.devices()).find(item=>item.serial()===serial);assert.ok(device);page=await(await device.webView({pkg:app})).page();await page.locator('.dock').waitFor();await page.locator('.load-note').waitFor({state:'hidden'});}
async function detach(){await device?.close();device=undefined;page=undefined;adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');}
async function snapshot(){return page.evaluate(async()=>{
  const databases=[];
  for(const info of (await indexedDB.databases()).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!info.name)continue;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),stores=[];
    for(const name of Array.from(db.objectStoreNames)){
      const entries=await new Promise((resolve,reject)=>{const entries=[],r=db.transaction(name).objectStore(name).openCursor();r.onsuccess=()=>{const cursor=r.result;if(cursor){entries.push({key:cursor.key,value:cursor.value});cursor.continue();}else resolve(entries);};r.onerror=()=>reject(r.error);});
      const store=db.transaction(name).objectStore(name),indexes=Array.from(store.indexNames).map(name=>{const index=store.index(name);return {name:index.name,keyPath:index.keyPath,multiEntry:index.multiEntry,unique:index.unique};});
      stores.push({name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,entries});
    }
    databases.push({name:db.name,version:db.version,stores});db.close();
  }
  return {databases,localStorage:Object.fromEntries(Object.entries(localStorage).sort(([a],[b])=>a.localeCompare(b)))};
});}
async function restore(){
  await page.evaluate(async original=>{
    for(const saved of original.databases){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(saved.name,saved.version);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      for(const store of saved.stores)await new Promise((resolve,reject)=>{const tx=db.transaction(store.name,'readwrite'),target=tx.objectStore(store.name);target.clear();for(const entry of store.entries){if(target.keyPath===null)target.put(entry.value,entry.key);else target.put(entry.value);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
    localStorage.clear();for(const [key,value] of Object.entries(original.localStorage))localStorage.setItem(key,value);
  },original);
  assert.deepEqual(await snapshot(),original,'所有数据库与localStorage必须恢复原值和结构');await page.reload();await page.locator('.dock').waitFor();await page.locator('.load-note').waitFor({state:'hidden'});assert.deepEqual(await snapshot(),original,'重启后原始数据应保持不变');report.originalDataRestored=true;
}
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
  await attach();original=await snapshot();const binary=serialize(original);assert.deepEqual(deserialize(binary),original);await writeFile(backupPath,binary);report.backupSha256=createHash('sha256').update(binary).digest('hex');await detach();
  const before=adb('shell','dumpsys','package',app),install=adb('install','-r',apk);assert.match(install,/Success/);const after=adb('shell','dumpsys','package',app);assert.equal(after.match(/^\s*versionName=(.*)$/m)?.[1].trim(),version);assert.equal(after.match(/^\s*firstInstallTime=(.*)$/m)?.[1].trim(),before.match(/^\s*firstInstallTime=(.*)$/m)?.[1].trim());report.install='adb install -r Success';
  adb('shell','am','force-stop',app);adb('shell','am','start','-f','0x10008000','-n',activity);await attach();assert.deepEqual(await snapshot(),original,'覆盖安装必须保留所有原始本地数据');pass('最新 debug 覆盖安装保留原始数据与首次安装时间');
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const value=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});assertValue(value);
    function assertValue(value){if(!value)throw Error('验证要求现有完整本地数据，避免隐式生成草稿');}
    value.onboarded=true;value.settings={...value.settings,scale:1,glass:true,glassMode:'full',mode:'light',performance:'auto',notificationsEnabled:false,reminders:false,pet:false};
    await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'app');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.glassMode==='full');assert.equal(await page.locator('.date-panel').evaluate(el=>getComputedStyle(el).backdropFilter.includes('blur')),true);pass('新版完全玻璃模式在 Android WebView 实际启用');await detach();
  const env={...process.env,ANDROID_SERIAL:serial,DEVICE_EVIDENCE_PREFIX:prefix};
  for(const script of ['scripts/check-keyboard-device.mjs','scripts/check-dock-device.mjs']){const result=spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:180000});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);assert.equal(result.status,0,`${script} 必须全部通过`);pass(`${script} 实际 Android 交互通过`);}
  report.completed=true;
}catch(error){firstError=error;report.error=error.message;}
finally{
  try{if(!page){adb('shell','am','start','-f','0x10008000','-n',activity);await attach();}await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});adb('shell','input','keyevent','111');if(original)await restore();}
  catch(error){report.restoreError=error.message;if(!firstError)firstError=error;}
  await writeFile(`build/evidence/${prefix}-interaction.json`,JSON.stringify(report,null,2));await detach();
}
if(firstError)throw firstError;
