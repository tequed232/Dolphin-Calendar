import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const base=process.env.TEST_URL??'http://127.0.0.1:5173',browser=await launchBrowser();
const context=await browser.newContext(),checks=[],failures=[],errors=[];
const pages=[await context.newPage(),await context.newPage()];
async function check(name,run){try{await run();checks.push(name);console.log('PASS '+name);}catch(error){failures.push({name,message:error.message});console.error('FAIL '+name+': '+error.message);}}
const read=page=>page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});
async function until(test){for(let i=0;i<80;i++){if(await test())return;await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(await test(),'其他窗口没有接收最新状态');}
try{
 const [providerSource,mainSource]=await Promise.all([fetch(base+'/src/state/AppState.tsx').then(r=>r.text()),fetch(base+'/src/main.tsx').then(r=>r.text())]);
 const reactURL=providerSource.match(/from "([^"]+\/react\.js[^"]*)"/)?.[1],reactDOMURL=mainSource.match(/from "([^"]+\/react-dom_client\.js[^"]*)"/)?.[1];assert.ok(reactURL&&reactDOMURL);
 const bootstrap=async({index,reactURL,reactDOMURL})=>{
   const [{initialData},{saveData},React,ReactDOM,{AppProvider,useApp},{PluginProvider,usePlugins},{useAutosavedText}]=await Promise.all([import('/src/lib/model.ts'),import('/src/lib/storage.ts'),import(reactURL),import(reactDOMURL),import('/src/state/AppState.tsx'),import('/src/state/PluginState.tsx'),import('/src/state/useAutosavedText.ts')]);
   if(index===0){const value=initialData();value.onboarded=true;value.settings.autoUpdate=false;await saveData(value);}
   const {createElement}=React.default??React,{createRoot}=ReactDOM.default??ReactDOM;
   function Probe(){const app=useApp(),plugins=usePlugins(),text=useAutosavedText(app.data.settings.school,value=>app.update(s=>({...s,settings:{...s.settings,school:value}})));window.__app=app;window.__plugins=plugins;window.__text=text;return createElement('div',null,app.error||plugins.error||String(app.ready&&plugins.ready));}
   createRoot(document.querySelector('#root')).render(createElement(AppProvider,null,createElement(PluginProvider,null,createElement(Probe))));
 };
 for(const [index,page] of pages.entries()){
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/main.tsx',route=>route.fulfill({contentType:'application/javascript',body:'export {};'}));await page.goto(base);
  await page.evaluate(bootstrap,{index,reactURL,reactDOMURL});
  await page.waitForFunction(()=>window.__app?.ready&&window.__plugins?.ready);
 }
 await check('另一个窗口修改偏好时，不覆盖第一个窗口刚保存的课程',async()=>{
  await pages[0].evaluate(()=>window.__app.update(s=>({...s,schedule:{...s.schedule,courses:[...s.schedule.courses,{id:'first',name:'窗口一课程',day:1,start:1,end:2,weeks:[1],teacher:'',room:'',notes:'',color:'sage'}]}})));
  await pages[1].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,scale:1.1}})));
  const value=await read(pages[0]);assert.equal(value.schedule.courses.some(c=>c.id==='first'),true);assert.equal(value.settings.scale,1.1);
 });
 await check('两个窗口同时追加课程，事务保留两项且各窗口自动收到最新状态',async()=>{
  await Promise.all(pages.map((page,i)=>page.evaluate(i=>window.__app.update(s=>({...s,schedule:{...s.schedule,courses:[...s.schedule.courses,{id:'parallel-'+i,name:'并发课程'+i,day:2,start:3,end:4,weeks:[1],teacher:'',room:'',notes:'',color:'sage'}]}})),i)));
  const value=await read(pages[0]);assert.ok([0,1].every(i=>value.schedule.courses.some(c=>c.id==='parallel-'+i)));
  await until(async()=>(await Promise.all(pages.map(page=>page.evaluate(()=>window.__app.data.schedule.courses.map(c=>c.id))))).every(ids=>ids.includes('parallel-0')&&ids.includes('parallel-1')));
 });
 await check('两个窗口分别安装插件并写专属配置，互不覆盖',async()=>{
  await Promise.all(pages.map((page,i)=>page.evaluate(i=>window.__plugins.install({manifest:{id:'org.audit.plugin'+i,name:'并发插件'+i,version:'1.0.0',apiVersion:1,permissions:['storage:local']},html:''}),i)));
  const raw=await pages[0].evaluate(async()=>{const {loadPluginState}=await import('/src/lib/plugins.ts');return loadPluginState();});assert.equal(raw.plugins.length,2);
  await Promise.all(pages.map((page,i)=>page.evaluate(i=>window.__plugins.setEnabled('org.audit.plugin'+i,true),i)));
  await Promise.all(pages.map((page,i)=>page.evaluate(i=>window.__plugins.saveData('org.audit.plugin'+i,{value:i}),i)));
  await until(async()=>(await Promise.all(pages.map(page=>page.evaluate(()=>window.__plugins.state)))).every(s=>s.plugins.length===2&&s.storage['org.audit.plugin0']?.value===0&&s.storage['org.audit.plugin1']?.value===1));
 });
 await check('其他窗口仅修改偏好时复用未变化的课程与教材引用',async()=>{
  await pages[0].evaluate(()=>{window.__schedule=window.__app.data.schedule;window.__books=window.__app.data.books;});
  await pages[1].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,showWeekend:!s.settings.showWeekend}})));
  const expected=(await read(pages[1])).settings.showWeekend;
  await until(()=>pages[0].evaluate(expected=>window.__app.data.settings.showWeekend===expected,expected));
  assert.deepEqual(await pages[0].evaluate(()=>[window.__app.data.schedule===window.__schedule,window.__app.data.books===window.__books]),[true,true]);
 });
 await check('事务中断保留原状态和版本，另一个窗口的后续提交仍能成功',async()=>{
  const before=await read(pages[0]);
  const failed=await pages[0].evaluate(async()=>{
   const original=IDBDatabase.prototype.transaction;let abortNext=true;
   IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite'&&abortNext){abortNext=false;queueMicrotask(()=>tx.abort());}return tx;};
   try{return await window.__app.update(s=>({...s,schedule:{...s.schedule,courses:[]}})).then(()=>false,()=>true);}finally{IDBDatabase.prototype.transaction=original;}
  });assert.equal(failed,true);assert.deepEqual(await read(pages[0]),before);
  await pages[1].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,mode:'dark'}})));assert.deepEqual((await read(pages[1])).schedule,before.schedule);
 });
 await check('广播到达时保留未保存草稿，提交草稿也保留另一窗口的新设置',async()=>{
  await pages[0].evaluate(()=>window.__text.change('窗口一未保存的学校'));
  await pages[1].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,advance:20}})));
  await until(()=>pages[0].evaluate(()=>window.__app.data.settings.advance===20));
  assert.equal(await pages[0].evaluate(()=>window.__text.value),'窗口一未保存的学校');
  await pages[0].evaluate(()=>window.__text.flush());const value=await read(pages[1]);assert.equal(value.settings.school,'窗口一未保存的学校');assert.equal(value.settings.advance,20);
 });
 await check('没有广播接口时在窗口恢复焦点后同步，写入仍不会覆盖其他窗口',async()=>{
  const fallback=await context.newPage();fallback.on('pageerror',error=>errors.push(error.message));
  await fallback.addInitScript(()=>{window.BroadcastChannel=undefined;});
  await fallback.route('**/src/main.tsx',route=>route.fulfill({contentType:'application/javascript',body:'export {};'}));await fallback.goto(base);
  await fallback.evaluate(bootstrap,{index:2,reactURL,reactDOMURL});await fallback.waitForFunction(()=>window.__app?.ready&&window.__plugins?.ready);
  assert.equal(await fallback.evaluate(()=>typeof window.BroadcastChannel),'undefined');
  await pages[1].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,school:'焦点恢复学校'}})));
  assert.notEqual(await fallback.evaluate(()=>window.__app.data.settings.school),'焦点恢复学校');
  await fallback.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await until(()=>fallback.evaluate(()=>window.__app.data.settings.school==='焦点恢复学校'));
  await fallback.evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,advance:15}})));
  const value=await read(pages[1]);assert.equal(value.settings.school,'焦点恢复学校');assert.equal(value.settings.advance,15);
  pages.push(fallback);
 });
 await check('另一窗口撤销插件启用后，旧窗口的配置写入不能复活插件或覆盖配置',async()=>{
  await pages[1].evaluate(()=>window.__plugins.setEnabled('org.audit.plugin0',false));
  assert.equal(await pages[2].evaluate(()=>window.__plugins.state.plugins.find(p=>p.manifest.id==='org.audit.plugin0').enabled),true,'无广播窗口仍持有过期启用快照');
  assert.equal(await pages[2].evaluate(()=>window.__plugins.saveData('org.audit.plugin0',{value:'不得写入'}).then(()=>false,()=>true)),true);
  const state=await pages[1].evaluate(async()=>{const {loadPluginState}=await import('/src/lib/plugins.ts');return loadPluginState();});
  assert.equal(state.plugins.find(p=>p.manifest.id==='org.audit.plugin0').enabled,false);assert.deepEqual(state.storage['org.audit.plugin0'],{value:0});
 });
 await check('损坏的事务版本拒绝覆盖当前课表，修复版本后队列继续成功',async()=>{
  const before=await read(pages[0]);
  const result=await pages[0].evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const get=key=>new Promise((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const put=value=>new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'appRevision');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
   const version=await get('appRevision');
   try{await put('damaged-version');const rejected=await window.__app.update(s=>({...s,schedule:{...s.schedule,courses:[]}})).then(()=>false,()=>true);return {rejected,raw:await get('app'),version:await get('appRevision')};}
   finally{await put(version);db.close();}
  });
  assert.equal(result.rejected,true);assert.equal(result.version,'damaged-version');assert.deepEqual(result.raw,before);
  await pages[0].evaluate(()=>window.__app.update(s=>({...s,settings:{...s.settings,advance:10}})));
  assert.deepEqual((await read(pages[1])).schedule,before.schedule);
 });
 await check('同窗口正常提交与恢复焦点只读取事务版本，不重复克隆完整课表',async()=>{
  const counts=await pages[0].evaluate(async()=>{
   await window.__app.update(s=>({...s,settings:{...s.settings,advance:12}}));
   const original=IDBObjectStore.prototype.get,reads=[];
   IDBObjectStore.prototype.get=function(key){if(this.transaction.db.name==='dolphin-calendar')reads.push(key);return original.call(this,key);};
   try{
    await window.__app.update(s=>({...s,settings:{...s.settings,advance:13}}));
    const {loadData}=await import('/src/lib/storage.ts');await loadData(window.__app.data);
    return {snapshots:reads.filter(key=>key==='app').length,versions:reads.filter(key=>key==='appRevision').length};
   }finally{IDBObjectStore.prototype.get=original;}
  });
  assert.equal(counts.snapshots,0);assert.ok(counts.versions>=2);
 });
 assert.deepEqual(errors,[]);
}finally{
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/multi-window.json',JSON.stringify({checks,failures,errors,success:checks.length===10&&!failures.length&&!errors.length},null,2));await browser.close();
}
assert.deepEqual(failures,[]);
