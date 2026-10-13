import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const base=process.env.TEST_URL??'http://127.0.0.1:5173',browser=await launchBrowser(),checks=[],errors=[];
const cover='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=';
async function fixture(native,corrupt=false){
 const context=await browser.newContext(),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/main.tsx',route=>route.fulfill({contentType:'application/javascript',body:'export {};'}));
 await page.goto(base);
 await page.evaluate(async({native,cover,corrupt})=>{
  window.__coverRenders=0;window.__commands=[];
  const ImageConstructor=window.Image;window.Image=class extends ImageConstructor{constructor(...args){super(...args);window.__coverRenders++;}};
  if(native)window.Dolphin={postMessage(raw){window.__commands.push(JSON.parse(raw));}};
  const reactURL=(await (await fetch('/src/state/AppState.tsx')).text()).match(/from "([^"]+\/react\.js[^"]*)"/)[1];
  const [{initialData},{saveData},React,ReactDOM,{AppProvider,useApp}]=await Promise.all([
   import('/src/lib/model.ts'),import('/src/lib/storage.ts'),import(reactURL),import(reactURL.replace('/react.js','/react-dom_client.js')),import('/src/state/AppState.tsx')
  ]);
  const {createElement}=React.default??React,{createRoot}=ReactDOM.default??ReactDOM;
  const data=initialData();data.onboarded=true;data.settings.autoUpdate=false;
  data.books={book:{title:'测试教材',publisher:'',edition:'',text:'',source:'manual',cover}};
  if(corrupt)data.schedule.courses=null;
  await saveData(data);
  function Probe(){const state=useApp();window.__update=state.update;window.__data=state.data;window.__ready=state.ready;window.__error=state.error;return createElement('span',null,state.error||String(state.ready));}
  createRoot(document.querySelector('#root')).render(createElement(AppProvider,null,createElement(Probe)));
 },{native,cover,corrupt});
 await page.waitForFunction(corrupt?()=>window.__error:()=>window.__ready);return {context,page};
}
async function stored(page){return page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
try{
 await check('普通 Web 不为无原生接收方生成教材通知缩图',async()=>{
  const {context,page}=await fixture(false);
  try{await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__coverRenders),0);
   await page.evaluate(()=>window.__update(value=>({...value,schedule:{...value.schedule,term:{...value.schedule.term,name:'更新课程'}}})));
   await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__coverRenders),0);
  }finally{await context.close();}
 });
 await check('Android 更改课程和提醒选项时发送最新同步，但复用未变的教材缩图',async()=>{
  const {context,page}=await fixture(true);
  try{
   await page.waitForFunction(()=>window.__commands.some(command=>command.type==='bookCovers'&&command.covers.book));
   const count=await page.evaluate(()=>window.__coverRenders);assert.equal(count,1);
   const coverMessages=await page.evaluate(()=>window.__commands.filter(command=>command.type==='bookCovers').length);
   await page.evaluate(async()=>{await window.__update(value=>({...value,schedule:{...value.schedule,term:{...value.schedule.term,name:'编辑后学期'}}}));await window.__update(value=>({...value,settings:{...value.settings,advance:15}}));});
   await page.waitForFunction(()=>window.__commands.some(command=>command.type==='sync'&&command.settings.advance===15));
   await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__coverRenders),count);
   assert.equal(await page.evaluate(()=>window.__commands.filter(command=>command.type==='sync').at(-1).schedule.term.name),'编辑后学期');
   await page.evaluate(()=>window.__update(value=>({...value,books:{...value.books,book:{...value.books.book,title:'新教材'}}})));
   await page.waitForFunction(previous=>window.__commands.filter(command=>command.type==='bookCovers').length===previous+1,coverMessages);
   assert.equal(await page.evaluate(()=>window.__coverRenders),count+1);
   assert.equal(await page.evaluate(()=>window.__commands.filter(command=>command.type==='sync').at(-1).bookTitles.book),'新教材');
  }finally{await context.close();}
 });
 await check('损坏快照在真实浏览器结束读取并报告错误，不静默重建覆盖原数据',async()=>{
  const {context,page}=await fixture(false,true);
  try{
   const error=await page.evaluate(()=>window.__error);assert.match(error,/本地数据无法读取/);
   assert.equal(await page.evaluate(()=>window.__ready),false);
   const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>{const db=request.result,get=db.transaction('state').objectStore('state').get('app');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};request.onerror=()=>reject(request.error);}));
   assert.equal(saved.schedule.courses,null);assert.equal(saved.books.book.title,'测试教材');
  }finally{await context.close();}
 });
 await check('保存事务中断保留原数据，后续队列更新仍基于最后成功保存的状态',async()=>{
  const {context,page}=await fixture(false);
  try{
   const before=await stored(page);
   const result=await page.evaluate(async()=>{
    const original=IDBDatabase.prototype.transaction;let abortNext=true;
    IDBDatabase.prototype.transaction=function(...args){const transaction=original.apply(this,args);if(args[1]==='readwrite'&&abortNext){abortNext=false;queueMicrotask(()=>transaction.abort());}return transaction;};
    try{
     const first=window.__update(value=>({...value,schedule:{...value.schedule,term:{...value.schedule.term,name:'失败修改不得落库'}}}));
     const second=window.__update(value=>({...value,settings:{...value.settings,scale:1.1}}));
     const settled=await Promise.allSettled([first,second]);return settled.map(item=>item.status);
    }finally{IDBDatabase.prototype.transaction=original;}
   });
   assert.deepEqual(result,['rejected','fulfilled']);const after=await stored(page);
   assert.deepEqual(after.schedule,before.schedule);assert.equal(after.settings.scale,1.1);assert.deepEqual(after.books,before.books);
   await page.waitForFunction(()=>window.__data.settings.scale===1.1);assert.equal(await page.evaluate(()=>window.__data.schedule.term.name),before.schedule.term.name);
  }finally{await context.close();}
 });
 assert.deepEqual(errors,[]);
}finally{
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/state-recovery-review.json',JSON.stringify({checks,errors,success:checks.length===4&&!errors.length},null,2));await browser.close();
}
