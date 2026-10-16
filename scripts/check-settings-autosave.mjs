import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const browser=await launchBrowser(),checks=[],errors=[];
const page=await browser.newPage({viewport:{width:390,height:844}});
const active=()=>page.locator('.screen.active');
const stored=()=>page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});
async function waitSaved(key,value){for(let i=0;i<80;i++){if((await stored()).settings[key]===value)return;await page.waitForTimeout(50);}assert.equal((await stored()).settings[key],value);}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){
   if(this.name==='state'&&args[1]==='app'){
    window.__appWrites=(window.__appWrites??0)+1;
    (window.__schoolWrites??=[]).push(args[0].settings?.school);
    if(window.__failSave)throw new DOMException('测试：本地空间不足','QuotaExceededError');
   }
   return put.apply(this,args);
  };
  const transaction=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args){
   const tx=transaction.apply(this,args);
   if(args[1]==='readwrite'){
    const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
    Object.defineProperty(tx,'oncomplete',{set(handler){descriptor.set.call(tx,handler?event=>setTimeout(()=>handler.call(tx,event),window.__saveDelay??0):null);},get(){return descriptor.get.call(tx);}});
   }
   return tx;
  };
 });
 await page.route('https://api.github.com/**',route=>route.fulfill({status:503,body:'fixture'}));
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
 await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await goTab(page,'设置');await active().locator('[data-setting=navigation]').click();
 await check('学校名称在保存延迟时连续输入不丢字，并合并短时间内的写入',async()=>{
  await page.evaluate(()=>{window.__saveDelay=120;window.__appWrites=0;});
  const school=active().getByRole('textbox',{name:'学校名称',exact:true});
  await school.pressSequentially('Dolphin University',{delay:8});
  assert.equal(await school.inputValue(),'Dolphin University');
  await waitSaved('school','Dolphin University');
  assert.ok(await page.evaluate(()=>window.__appWrites)<=3,'连续输入不应逐字写入整个数据库');
  await page.waitForTimeout(200);
  assert.equal((await stored()).settings.school,'Dolphin University',JSON.stringify(await page.evaluate(()=>window.__schoolWrites)));
 });
 await check('中文组合输入只在确认后保存，不保存输入法的中间拼写',async()=>{
  const school=active().getByRole('textbox',{name:'学校名称',exact:true});
  await school.evaluate(input=>{
   input.focus();input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
   setter.call(input,'zhongwen');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'zhongwen',isComposing:true}));
  });
  await page.waitForTimeout(400);assert.equal((await stored()).settings.school,'Dolphin University',JSON.stringify(await page.evaluate(()=>({writes:window.__schoolWrites,value:document.querySelector('input[placeholder]')?.value}))));
  await school.evaluate(input=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'海豚大学');
   input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'海豚大学',isComposing:true}));
   input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'海豚大学'}));
  });
  await school.blur();
  await waitSaved('school','海豚大学');
  await page.waitForTimeout(200);
 });
 await check('学校保存失败保留输入，离开时可重试保存，刷新后保留完整新值',async()=>{
  await page.evaluate(()=>window.__failSave=true);
  await active().getByRole('textbox',{name:'学校名称',exact:true}).fill('海豚大学紫金港校区');
  await active().getByRole('alert').filter({hasText:'未能保存'}).waitFor();
  assert.equal((await stored()).settings.school,'海豚大学');
  assert.equal(await active().getByRole('textbox',{name:'学校名称',exact:true}).inputValue(),'海豚大学紫金港校区');
  await page.setViewportSize({width:320,height:568});
  await page.evaluate(()=>{document.documentElement.dataset.mode='dark';document.documentElement.style.setProperty('--ui-scale','1.35');});
  assert.ok(await active().evaluate(screen=>screen.scrollWidth<=screen.clientWidth+1),'窄屏大字号下保存失败信息不能撑出页面');
  await page.screenshot({path:'build/evidence/audit-school-error-dark.png'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.setProperty('--ui-scale','1'));
  await active().getByRole('button',{name:'返回上一页',exact:true}).click();
  const guard=page.getByRole('dialog',{name:'有尚未保存的内容',exact:true});await guard.waitFor();
  await page.evaluate(()=>window.__failSave=false);await guard.getByRole('button',{name:'保存后离开',exact:true}).click();
  await page.locator('[data-screen=settings].active').waitFor();
  await page.reload();await goTab(page,'设置');await active().locator('[data-setting=navigation]').click();
  assert.equal(await active().getByRole('textbox',{name:'学校名称',exact:true}).inputValue(),'海豚大学紫金港校区');
 });
 await active().getByRole('button',{name:'返回上一页',exact:true}).click();
 await page.locator('[data-screen=settings].active').waitFor();await active().locator('[data-setting=notifications]').click();
 await active().getByRole('button',{name:/台词管理/}).click();
 await check('台词保存失败有明确状态，草稿可重试，空白行和整段内容准确恢复',async()=>{
  const before=(await stored()).settings.lines;
  await page.evaluate(()=>window.__failSave=true);
  await active().getByRole('textbox',{name:'第 1 句台词',exact:true}).fill('带上新教材，去上课。');
  await active().getByRole('alert').filter({hasText:'未能保存'}).waitFor();
  assert.equal((await stored()).settings.lines,before);
  await page.screenshot({path:'build/evidence/audit-lyrics-error.png'});
  await page.evaluate(()=>window.__failSave=false);
  await active().getByRole('button',{name:'重试保存',exact:true}).click();
  await waitSaved('lines','带上新教材，去上课。\n'+before.split('\n').slice(1).join('\n'));
  await page.waitForTimeout(200);await active().getByRole('button',{name:'添加一句台词',exact:true}).click();
  await page.waitForTimeout(500);assert.ok((await stored()).settings.lines.endsWith('\n'));
  await page.reload();await goTab(page,'设置');await active().locator('[data-setting=notifications]').click();await active().getByRole('button',{name:/台词管理/}).click();
  assert.equal(await active().getByRole('textbox',{name:'第 1 句台词',exact:true}).inputValue(),'带上新教材，去上课。');
 });
 await check('保存进行中继续输入并立即返回，会保存最终草稿后离开且不打断操作',async()=>{
  await goTab(page,'设置');await active().locator('[data-setting=navigation]').click();
  await page.evaluate(()=>window.__saveDelay=250);
  const school=active().getByRole('textbox',{name:'学校名称',exact:true});
  await school.fill('第一版学校名称');await page.waitForTimeout(350);await school.fill('最终学校名称');
  await active().getByRole('button',{name:'返回上一页',exact:true}).click();
  await page.locator('[data-screen=settings].active').waitFor();
  assert.equal((await stored()).settings.school,'最终学校名称');
  assert.equal(await page.getByRole('dialog',{name:'有尚未保存的内容',exact:true}).count(),0);
 });
 assert.deepEqual(errors,[]);
}finally{
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/settings-autosave.json',JSON.stringify({checks,errors,success:checks.length===5&&!errors.length},null,2));await browser.close();
}
