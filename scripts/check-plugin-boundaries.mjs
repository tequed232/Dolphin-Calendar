import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1],browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Singapore'}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const active=()=>page.locator('.screen.active');
const frame=()=>page.frames().find(frame=>frame.name()==='boundary-frame')??page.frames().find(frame=>frame!==page.mainFrame());
const state=()=>page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return loadData();});
const plugins=()=>page.evaluate(async()=>{const {loadPluginState}=await import('/src/lib/plugins.ts');return loadPluginState();});
const pack={manifest:{id:'org.example.boundaries',name:'接口边界',version:'1.0.0',apiVersion:1,minAppVersion:version,permissions:[],contributes:{view:true}},html:'<main id="ready">边界测试</main>',javascript:'window.DolphinPlugin.ready().then(()=>document.body.dataset.ready="true");'};
async function pass(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function manager(){await goTab(page,'设置');await active().locator('[data-setting=plugins]').click();await active().locator('.plugin-manager').waitFor();}
async function install(pkg){await active().locator('input[type=file]').setInputFiles({name:'boundary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pkg))});const dialog=page.getByRole('dialog',{name:/确认(?:安装|更新)插件/});await dialog.getByRole('button',{name:/授权并(?:安装|更新)/}).click();await active().locator('[id="plugin-enabled-org.example.boundaries"]').click();await page.getByRole('dialog',{name:'确认启用插件',exact:true}).getByRole('button',{name:'确认启用',exact:true}).click();await active().getByRole('button',{name:'打开插件工具',exact:true}).click();await page.frameLocator('iframe[title="接口边界"]').locator('body[data-ready=true]').waitFor();}
try{
 await mkdir('build/evidence',{recursive:true});await page.clock.setFixedTime(new Date('2026-10-13T08:00:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await manager();await install(pack);const original=await state();
 await pass('无权限插件上下文不包含课表，读课表/存储/导航/导入均明确拒绝',async()=>{
  const result=await frame().evaluate(async()=>{const sdk=window.DolphinPlugin,context=await sdk.getContext(),calls=[];for(const [method,args] of [['getSchedule',[]],['getCourses',[]],['loadData',[]],['saveData',[{a:1}]],['selectDate',['2026-10-14']],['requestImport',[{courses:[]}]],['openCourse',['unknown']]]){try{await sdk[method](...args);calls.push({method,accepted:true});}catch(error){calls.push({method,error:error.message});}}return {context,calls};});assert.equal('schedule' in result.context,false);assert.ok(result.calls.every(call=>call.error?.includes('未获授权')),JSON.stringify(result));assert.deepEqual(await state(),original);assert.deepEqual((await plugins()).storage,{});
 });
 await pass('插件frame不能访问宿主DOM、数据库或原生对象，常规fetch被CSP拒绝',async()=>{
  const result=await frame().evaluate(async()=>{let dom=false,db=false,network=false;try{void parent.document.body;}catch{dom=true;}try{indexedDB.open('dolphin-calendar',1);}catch{db=true;}try{await fetch('https://example.invalid/plugin-boundary');}catch{network=true;}return {dom,db,network,native:typeof window.Dolphin};});assert.deepEqual(result,{dom:true,db:true,network:true,native:'undefined'});assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
 });
 await pass('错误会话及宿主伪造的消息不能改变日期或写插件配置',async()=>{
  const before=await page.locator('.tab-screen[data-screen=list] .home-inner').getAttribute('data-focus-date');await frame().evaluate(()=>parent.postMessage({protocol:'dolphin-plugin-v1',session:'wrong-session',id:'123',method:'selectDate',args:{date:'2026-10-14'}},'*'));await page.evaluate(()=>window.postMessage({protocol:'dolphin-plugin-v1',session:'wrong-session',id:'124',method:'saveData',args:{value:{bad:true}}},'*'));await page.waitForTimeout(100);assert.equal(await page.locator('.tab-screen[data-screen=list] .home-inner').getAttribute('data-focus-date'),before);assert.deepEqual((await plugins()).storage,{});assert.deepEqual(await state(),original);
 });
 await pass('授权后API给克隆快照，插件本地改对象不能修改宿主课程',async()=>{
  await manager();await install({...pack,manifest:{...pack.manifest,version:'1.0.1',permissions:['schedule:read','navigation:date','storage:local']}});const result=await frame().evaluate(async()=>{const snapshot=await window.DolphinPlugin.getSchedule();snapshot.term.name='mutated';snapshot.courses.push({name:'injected'});return await window.DolphinPlugin.getSchedule();});assert.deepEqual(result,original.schedule);assert.deepEqual(await state(),original);
 });
 await pass('非法日期和超限配置拒绝；并行配置事务串行保存，随后拒绝不损坏数据',async()=>{
  const result=await frame().evaluate(async()=>{const sdk=window.DolphinPlugin,failures=[];for(const date of ['2026-02-29','2026-10-32','1800-01-01'])try{await sdk.selectDate(date);}catch(error){failures.push(error.message);}await Promise.all([sdk.saveData({order:1}),sdk.saveData({order:2})]);try{await sdk.saveData({text:'字'.repeat(90000)});}catch(error){failures.push(error.message);}return {failures,data:await sdk.loadData()};});assert.equal(result.failures.length,4);assert.deepEqual(result.data,{order:2});assert.deepEqual((await plugins()).storage['org.example.boundaries'],{order:2});assert.deepEqual(await state(),original);
 });
 await pass('运行错误停用当前frame，宿主关闭按钮仍可用，课表页面无插件界面',async()=>{
  await frame().evaluate(()=>{const script=document.createElement('script');script.textContent="throw new Error('模拟插件异常')";document.body.append(script);});await active().getByRole('alert').filter({hasText:'插件运行发生错误'}).waitFor();await active().getByRole('button',{name:'关闭插件工具',exact:true}).click();await page.locator('iframe').waitFor({state:'detached'});assert.equal((await plugins()).viewId,null);assert.deepEqual(await state(),original);assert.ok(errors.every(error=>error.includes('模拟插件异常')),JSON.stringify(errors));
 });
 await pass('不支持隔离的原生环境拒绝插件运行，内置列表与关闭按钮保留',async()=>{
  await page.evaluate(()=>{window.Dolphin={postMessage(){}};window.dolphinPluginSandboxSupported=false;});await manager();await active().getByRole('button',{name:'打开插件工具',exact:true}).click();await active().getByRole('status').filter({hasText:'不支持插件隔离'}).waitFor();assert.equal(await page.locator('iframe').count(),0);await active().getByRole('button',{name:'关闭插件工具',exact:true}).click();await goTab(page,'列表');await active().locator('.home-schedule-heading').waitFor();assert.deepEqual(await state(),original);
 });
 assert.deepEqual(errors.filter(error=>!error.includes('模拟插件异常')),[]);
}catch(error){await page.screenshot({path:`build/evidence/${version}-plugin-boundaries-failure.png`});throw error;}
finally{await writeFile(`build/evidence/${version}-plugin-boundaries-results.json`,JSON.stringify({version,checks,errors,completed:checks.length===7},null,2));await browser.close();}
