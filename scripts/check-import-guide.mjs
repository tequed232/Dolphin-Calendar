import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access,readdir} from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const evidence=path.resolve('build/evidence'),checks=[],errors=[],samples=[];
const tutorial='https://tequed232.github.io/Dolphin-Calendar/import-guide/';
const release='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest';
await mkdir(evidence,{recursive:true});
const build=spawnSync(process.execPath,['scripts/build-pages.mjs'],{stdio:'inherit'});assert.equal(build.status,0,'必须生成当前源码的 Pages 教程，而不是使用旧输出');
const root=path.resolve('build/pages'),prefix='/Dolphin-Calendar/',misses=[];
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;assert.ok(pathname.startsWith(prefix));
  let relative=decodeURIComponent(pathname.slice(prefix.length));if(!relative||relative.endsWith('/'))relative+='index.html';
  const file=path.resolve(root,relative);assert.ok(file.startsWith(root+path.sep));const bytes=await readFile(file);
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webm':'video/webm','.json':'application/json','.csv':'text/csv','.txt':'text/plain'}[path.extname(file)]??'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{misses.push(req.url);res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,guideUrl=origin+prefix+'import-guide/';
const browser=await launchBrowser();
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Singapore'}),page=await context.newPage();
const active=()=>page.locator('.screen.active'),preview=()=>page.getByRole('dialog',{name:'确认这份课表',exact:true});
page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{
 window.commands=[];window.Dolphin={postMessage(raw){window.commands.push(JSON.parse(raw));}};window.copies=[];window.clipboardReads=0;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copies.push(text);},readText:async()=>{window.clipboardReads++;throw new Error('unexpected clipboard read');}}});
});
await context.route(release,route=>route.fulfill({json:{tag_name:`v${version}`,html_url:`https://github.com/tequed232/Dolphin-Calendar/releases/tag/v${version}`,draft:false,prerelease:false,assets:[]}}));
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result);db.close();};};}));}
async function openImport(){await goTab(page,'列表');await active().evaluate(el=>el.scrollTop=0);await active().getByRole('button',{name:'导入课表',exact:true}).click();await active().locator('.import-help').waitFor();}
async function downloads(name){const event=page.waitForEvent('download');await active().getByRole('button',{name,exact:true}).click();const file=await event;return {name:file.suggestedFilename(),text:await readFile(await file.path(),'utf8')};}
async function parseCSV(text){return page.evaluate(async text=>{const {parseSheet,csvRows}=await import('/src/lib/fileImport.ts'),{initialData}=await import('/src/lib/model.ts');return parseSheet({name:'验收模板',rows:csvRows(text),merges:[]},initialData().schedule);},text);}
const templateText=text=>text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trimEnd();
function expectedComplete(schedule){
 assert.equal(schedule.periods.length,12);assert.equal(schedule.courses.length,3);assert.deepEqual(schedule.periods[3].breakAfter,{label:'午休',start:'11:40',end:'14:00'});assert.equal(schedule.periods[0].start,'08:00');assert.equal(schedule.periods[11].end,'22:30');
 const math=schedule.courses.find(c=>c.name==='高等数学'),english=schedule.courses.find(c=>c.name==='大学英语'),sport=schedule.courses.find(c=>c.name==='大学体育');
 assert.equal(math.day,3);assert.equal(math.start,5);assert.equal(math.end,6);assert.equal(math.room,'16栋203号教室');assert.equal(english.day,5);assert.equal(english.start,3);assert.equal(english.end,4);assert.deepEqual(english.weeks,[1,3,5,7,9,11,13,15]);assert.equal(sport.day,4);assert.equal(sport.start,7);assert.equal(sport.end,7);assert.deepEqual(sport.weeks,[2,4,6,8,10,12,14,16]);
}
let csv,json,prompt,before,guide;
try{
 await page.clock.setFixedTime(new Date('2026-10-07T06:05:00Z'));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await page.evaluate(async()=>{
  const {initialData}=await import('/src/lib/model.ts'),{generatePeriods}=await import('/src/lib/scheduleTime.ts'),data=initialData();data.onboarded=true;data.settings={...data.settings,autoUpdate:false,mode:'dark',uiScale:1.1};data.schedule.term={name:'原有合成学期',startDate:'2026-10-05',weeks:20};data.schedule.periods=generatePeriods(8,'08:20',40,10);data.schedule.courses=[{id:'retained-before-import',name:'原有合成课程',teacher:'演示教师',room:'演示楼101',day:3,start:1,end:2,weeks:[1],notes:'取消预览必须保留',color:'sage'}];data.books={'原有合成课程':{title:'保留教材',publisher:'演示出版社',edition:'演示版'}};
  const db=await new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');tx.oncomplete=resolve;});db.close();
 });await page.reload();await openImport();before=await state();
 await check('导入页只有完整 CSV / JSON 模板与统一 AI 提示词入口，尚未操作不会打开教程',async()=>{
  assert.equal(await active().getByRole('button',{name:'CSV 示例模板',exact:true}).count(),0);assert.equal(await active().getByRole('button',{name:'CSV 时间模板',exact:true}).count(),0);assert.equal(await active().getByRole('button',{name:'JSON 时间模板',exact:true}).count(),0);assert.equal(await active().getByRole('button',{name:'查看导入教程',exact:true}).count(),0);assert.equal(await active().getByRole('button',{name:'向 AI 输入提示词导入课表',exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.type==='openExternal').length),0);
 });
 await active().locator('.import-format-help').evaluate(el=>el.open=true);
 await check('完整格式说明兼顾单节、连堂、逐节时间与午休，旧字段说明仍可查看',async()=>{
  await active().getByRole('button',{name:'查看格式说明',exact:true}).click();const dialog=page.getByRole('dialog',{name:'完整课表格式说明',exact:true});assert.match(await dialog.innerText(),/每行只填一个节次/);assert.match(await dialog.innerText(),/不能.*平均|不能按.*平均/);assert.match(await dialog.innerText(),/start=end/);await dialog.locator('details').evaluate(el=>el.open=true);assert.match(await dialog.innerText(),/GB18030/);assert.match(await dialog.innerText(),/课程名.*星期.*节次/s);await dialog.getByRole('button',{name:'知道了',exact:true}).click();
 });
 await check('Android 模板下载复用原生 export，类型与全部模板内容正确，下载不改课表',async()=>{
  await active().getByRole('button',{name:'CSV 完整课表模板',exact:true}).click();await active().getByRole('button',{name:'JSON 完整课表模板',exact:true}).click();const exports=await page.evaluate(()=>window.commands.filter(c=>c.type==='export'));assert.equal(exports.length,2);assert.equal(exports[0].mime,'text/csv');assert.equal(exports[1].mime,'application/json');assert.match(exports[0].name,/complete\.csv$/);assert.match(exports[1].name,/complete\.json$/);expectedComplete((await parseCSV(exports[0].text)).schedule);expectedComplete(JSON.parse(exports[1].text));assert.deepEqual(await state(),before);
 });
 await page.evaluate(()=>delete window.Dolphin);
 await check('真实浏览器下载统一 CSV，完整 12 节和单双周单节/连堂可预览，取消保留旧数据',async()=>{
  csv=await downloads('CSV 完整课表模板');assert.match(csv.name,/complete\.csv$/);const parsed=await parseCSV(csv.text);assert.deepEqual(parsed.errors,[]);expectedComplete(parsed.schedule);await active().getByLabel('选择课表文件',{exact:true}).setInputFiles({name:csv.name,mimeType:'text/csv',buffer:Buffer.from(csv.text)});await preview().waitFor();assert.match(await preview().innerText(),/3 个课程块 · 12 节/);assert.match(await preview().innerText(),/大学体育.*周四 · 7–7 节/s);assert.deepEqual(await state(),before);await preview().getByRole('button',{name:'返回修改',exact:true}).click();await page.getByRole('dialog',{name:'读取课表',exact:true}).getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await state(),before);
 });
 await check('真实浏览器下载统一 JSON，一份包含 term/periods/courses，预览取消不提交',async()=>{
  json=await downloads('JSON 完整课表模板');assert.match(json.name,/complete\.json$/);const value=JSON.parse(json.text);assert.deepEqual(Object.keys(value).sort(),['courses','periods','term']);expectedComplete(value);await active().getByLabel('选择课表文件',{exact:true}).setInputFiles({name:json.name,mimeType:'application/json',buffer:Buffer.from(json.text)});await preview().waitFor();assert.equal(await page.locator('#import-date-value').innerText(),'2026/09/01');assert.deepEqual(await state(),before);await preview().getByRole('button',{name:'返回修改',exact:true}).click();await page.getByRole('dialog',{name:'读取课表',exact:true}).getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await state(),before);
 });
 await check('下载的完整 CSV 经原确认流程替换课程并写入全部时间，教材偏好与未提供学期资料保留',async()=>{
  await active().getByLabel('选择课表文件',{exact:true}).setInputFiles({name:csv.name,mimeType:'text/csv',buffer:Buffer.from(csv.text)});await preview().waitFor();await preview().getByRole('button',{name:'确认导入',exact:true}).click();await preview().waitFor({state:'hidden'});await page.reload();const after=await state();expectedComplete(after.schedule);assert.deepEqual(after.schedule.term,before.schedule.term);assert.deepEqual(after.books,before.books);assert.deepEqual(after.settings,before.settings);await openImport();
 });
 await check('AI 提示词同时要求学期/逐节/课程，缺资料先问、单节连堂边界不猜测，只主动复制',async()=>{
  await active().getByRole('button',{name:'向 AI 输入提示词导入课表',exact:true}).click();const dialog=page.getByRole('dialog',{name:'复制给 AI 的提示词',exact:true});prompt=await dialog.getByLabel('AI 完整课表提示词',{exact:true}).inputValue();for(const term of ['term','periods','courses','start=end','start<end','breakAfter','HH:mm','开学日期','周次'])assert.ok(prompt.includes(term),term);assert.match(prompt,/先.*具体问题并等待回答/);assert.match(prompt,/禁止按总时长平均拆分/);assert.match(prompt,/用户明确确认了单节时长、课间长度和连堂构成规则/);assert.match(prompt,/不能漏掉没有课程的节次/);const snapshot=await state();assert.equal(await page.evaluate(()=>window.copies.length),0);await dialog.getByRole('button',{name:'复制提示词',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.copies),[prompt]);assert.equal(await page.evaluate(()=>window.clipboardReads),0);assert.deepEqual(await state(),snapshot);
 });
 await check('教程外链由用户点击触发，Web 新页使用 noopener，Android 只调用原 HTTPS 外部浏览器桥接',async()=>{
  const link=page.getByRole('dialog',{name:'复制给 AI 的提示词',exact:true}).getByRole('link',{name:'打开图文与视频教程',exact:true});assert.equal(await link.getAttribute('href'),tutorial);assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);assert.match(await link.getAttribute('rel'),/noreferrer/);await page.evaluate(()=>window.Dolphin={postMessage(raw){window.commands.push(JSON.parse(raw));}});const snapshot=await state();await link.click();const commands=await page.evaluate(()=>window.commands.filter(c=>c.type==='openExternal'));assert.deepEqual(commands,[{type:'openExternal',url:tutorial}]);assert.match(page.url(),/^http:\/\/127\.0\.0\.1:/);assert.deepEqual(await state(),snapshot);
  await page.evaluate(()=>delete window.Dolphin);await context.route(tutorial,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Tutorial route fixture</title>'}));const popupEvent=context.waitForEvent('page');await link.click();const popup=await popupEvent;await popup.waitForLoadState();assert.equal(popup.url(),tutorial);assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();await page.getByRole('dialog',{name:'复制给 AI 的提示词',exact:true}).getByRole('button',{name:'关闭对话框',exact:true}).click();
 });
 await check('教程只存在 Pages 发布输出，普通 Web/APK 构建不携带教程照片视频',async()=>{
  const appGuide=await readdir('web/dist/import-guide').catch(error=>{if(error.code==='ENOENT')return [];throw error;});assert.deepEqual(appGuide,[],'App 不得内置教程文件或媒体；空目录不携带资源');for(const file of ['index.html','guide.css','guide.js','prompt.txt','schedule.csv','schedule.json','demo-source.txt','import-demo.webm','chatgpt-demo.jpg','deepseek-demo.jpg','chatgpt-step.png','deepseek-step.png','app-import-step.png'])await access(path.join(root,'import-guide',file));
 });
 const guideContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),requests=[];guide=await guideContext.newPage();guide.on('pageerror',e=>errors.push(e.message));guideContext.on('request',request=>requests.push(request.url()));
 await guideContext.addInitScript(()=>{window.copies=[];window.databaseCalls=0;const original=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.databaseCalls++;return original(...args);};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
 await guide.goto(guideUrl);await guide.waitForFunction(()=>!document.querySelector('#copy-prompt').disabled);
 await check('项目前缀教程加载六步正文，提示词与 App 完全相同，模板下载保持一份来源',async()=>{
  assert.equal(await guide.locator('.steps>.step').count(),6);assert.equal(templateText(await guide.locator('#prompt-text').inputValue()),templateText(prompt));assert.equal(templateText(await (await fetch(guideUrl+'prompt.txt')).text()),templateText(prompt));assert.equal(templateText(await (await fetch(guideUrl+'schedule.csv')).text()),templateText(csv.text));assert.equal(templateText(await (await fetch(guideUrl+'schedule.json')).text()),templateText(json.text));assert.equal(await guide.locator('.brand').getAttribute('href'),'../');assert.match(await guide.locator('#prepare').innerText(),/不能.*平均|不能让 AI 平均/);assert.equal(await guide.locator('a[href="https://chatgpt.com/"]').count(),1);assert.equal(await guide.locator('a[href="https://chat.deepseek.com/"]').count(),1);assert.equal(await guide.evaluate(()=>window.databaseCalls),0);
 });
 await check('教程主动复制统一提示词和真实下载两模板，不读取应用数据或访问外部 AI',async()=>{
  await guide.locator('.prompt-box').evaluate(el=>el.open=true);assert.equal(await guide.evaluate(()=>window.copies.length),0);const displayed=await guide.locator('#prompt-text').inputValue();await guide.locator('#copy-prompt').click();assert.deepEqual(await guide.evaluate(()=>window.copies),[displayed]);assert.equal(templateText(displayed),templateText(prompt));assert.match(await guide.locator('#copy-status').innerText(),/复制/);
  for(const [name,text] of [['schedule.csv',csv.text],['schedule.json',json.text]]){const event=guide.waitForEvent('download');await guide.locator(`a[download][href="${name}"]`).click();const file=await event;assert.equal(file.suggestedFilename(),name);assert.equal(templateText(await readFile(await file.path(),'utf8')),templateText(text));}assert.equal(await guide.evaluate(()=>window.databaseCalls),0);assert.deepEqual(requests.filter(url=>!url.startsWith(origin)),[]);
 });
 await check('六节练习 JSON/CSV 对应公开演示文案，单节及连堂和单双周真实可解析',async()=>{
  const syntheticJSON=JSON.parse(await (await fetch(guideUrl+'synthetic-schedule.json')).text()),syntheticCSV=await parseCSV(await (await fetch(guideUrl+'synthetic-complete.csv')).text());assert.deepEqual(syntheticCSV.errors,[]);assert.equal(syntheticJSON.term.startDate,'2026-09-07');assert.equal(syntheticJSON.term.weeks,4);for(const data of [syntheticJSON,syntheticCSV.schedule]){assert.equal(data.periods.length,6);assert.equal(data.courses.length,3);assert.deepEqual(data.periods[3].breakAfter,{label:'午休',start:'11:40',end:'14:00'});assert.deepEqual(data.courses.map(c=>({name:c.name,day:c.day,start:c.start,end:c.end,weeks:c.weeks})),[{name:'程序设计基础',day:1,start:1,end:2,weeks:[1,2,3,4]},{name:'学术英语',day:3,start:3,end:3,weeks:[1,3]},{name:'设计与生活',day:5,start:5,end:6,weeks:[2,4]}]);}
 });
 await check('手机、大字与横屏教程无整页横向溢出，复制和下载控件可触达',async()=>{
  for(const [width,height] of [[320,568],[390,844],[844,390],[1304,892]])for(const scale of [1,1.35,2]){await guide.setViewportSize({width,height});await guide.evaluate(scale=>document.documentElement.style.fontSize=(16*scale)+'px',scale);assert.equal(await guide.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,JSON.stringify({width,height,scale}));await guide.locator('#copy-prompt').scrollIntoViewIfNeeded();assert.ok(await guide.locator('#copy-prompt').isVisible());await guide.locator('a[download][href="schedule.csv"]').scrollIntoViewIfNeeded();assert.ok(await guide.locator('a[download][href="schedule.csv"]').isVisible());samples.push({width,height,scale});}
  await guide.setViewportSize({width:390,height:844});await guide.evaluate(()=>document.documentElement.style.fontSize='16px');await guide.locator('#ai').scrollIntoViewIfNeeded();await guide.screenshot({path:path.join(evidence,`${version}-import-guide-portrait.png`)});
 });
 await check('教程真实图片与标注图可加载，WebM 可解码并由操作开始播放，初始不自动播放',async()=>{
  await guide.waitForFunction(()=>document.querySelector('#video-media video')?.readyState>=1);const video=guide.locator('#video-media video');assert.equal(await video.getAttribute('autoplay'),null);assert.equal(await video.getAttribute('preload'),'metadata');assert.equal(await video.evaluate(el=>el.paused),true);const media=await video.evaluate(el=>({duration:el.duration,width:el.videoWidth,height:el.videoHeight}));assert.ok(media.duration>0&&media.width>0&&media.height>0,JSON.stringify(media));await video.evaluate(el=>{el.muted=true;return el.play();});await guide.waitForFunction(()=>document.querySelector('#video-media video').currentTime>0.1);await video.evaluate(el=>el.pause());
  for(const file of ['chatgpt-demo.jpg','deepseek-demo.jpg','chatgpt-step.png','deepseek-step.png','app-import-step.png']){const loaded=await guide.evaluate(async file=>{const img=new Image();img.src=file;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};},file);assert.ok(loaded.width>0&&loaded.height>0,file);}
  assert.equal(await guide.locator('figure[data-image="chatgpt-demo.jpg"]').evaluate(el=>el.hidden),false);assert.equal(await guide.locator('figure[data-image="deepseek-demo.jpg"]').evaluate(el=>el.hidden),false);
  for(const [selector,file] of [['figure[data-image="chatgpt-demo.jpg"]','chatgpt-step.png'],['figure[data-image="deepseek-demo.jpg"]','deepseek-step.png'],['#app-preview-media','app-import-step.png']]){const link=guide.locator(selector+' a');assert.equal(await link.evaluate(el=>el.href),guideUrl+file);assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);assert.match(await link.getAttribute('rel'),/noreferrer/);}
  await guide.setViewportSize({width:1304,height:892});await guide.locator('#video').scrollIntoViewIfNeeded();await guide.screenshot({path:path.join(evidence,`${version}-import-guide-video.png`)});
 });
 await check('媒体缺失时隐藏图片和视频，图文仍完整，失败提示词读取不误复制占位文字',async()=>{
  const absent=await browser.newContext();await absent.route('**/import-guide/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(['import-demo.webm','chatgpt-demo.jpg','deepseek-demo.jpg','chatgpt-step.png','deepseek-step.png','app-import-step.png','prompt.txt'].includes(name))await route.fulfill({status:404});else await route.continue();});const fallback=await absent.newPage();fallback.on('pageerror',e=>errors.push(e.message));await fallback.goto(guideUrl);await fallback.waitForTimeout(400);assert.equal(await fallback.locator('#video-media').evaluate(el=>el.hidden),true);assert.equal(await fallback.locator('figure[data-image="chatgpt-demo.jpg"]').evaluate(el=>el.hidden),true);assert.equal(await fallback.locator('figure[data-image="deepseek-demo.jpg"]').evaluate(el=>el.hidden),true);assert.equal(await fallback.locator('#copy-prompt').isDisabled(),true);assert.equal(await fallback.locator('.steps>.step').count(),6);await absent.close();
 });
 await check('教程深浅主题切换只影响本站显示，不产生数据库访问、远程上传或资源 404',async()=>{
  const initial=await guide.locator('#theme').innerText();await guide.locator('#theme').click();assert.notEqual(await guide.locator('#theme').innerText(),initial);await guide.locator('#theme').click();assert.equal(await guide.evaluate(()=>window.databaseCalls),0);assert.deepEqual(requests.filter(url=>!url.startsWith(origin)),[]);assert.deepEqual(misses,[]);assert.deepEqual(errors,[]);
 });
 await writeFile(path.join(evidence,`${version}-import-guide-results.json`),JSON.stringify({version,at:new Date().toISOString(),checks,errors,samples,subdirectory:prefix,generatedFromCurrentSource:true,appTutorialAssets:false,completed:true},null,2));
}catch(error){await writeFile(path.join(evidence,`${version}-import-guide-results.json`),JSON.stringify({version,checks,errors,samples,completed:false,failure:String(error)},null,2));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
