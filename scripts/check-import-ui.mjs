import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const old=process.env.LEGACY_SCHEDULE_PATH;
if(old&&!existsSync(old))throw new Error('LEGACY_SCHEDULE_PATH 指向的旧版课表不存在');
const fallback={term:'2026-2027-1',termStart:'2026-08-31',periods:[
 {period:'第1-2节',time:'08:30-09:55',days:[[{name:'数学',weeks:'1-21'}]]},
 {period:'第中午1-中午2节',time:'12:10-13:35',days:[[],[{name:'午间实践',weeks:'21'}]]}
]};
const raw=old?JSON.parse((await readFile(old,'utf8')).split('= {')[1].trim().replace(/;$/,'').replace(/^/,'{')):fallback;
const expected=raw.periods.reduce((n,p)=>n+p.days.reduce((m,d)=>m+d.length,0),0);
const browser=await launchBrowser();const report={at:new Date().toISOString(),realOldSchedule:!!old,expectedCourses:expected,checks:[]};
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function openImport(){await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();}
try{
 await page.clock.setFixedTime(new Date(2026,8,30,9));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();await openImport();
 await page.locator('.screen.active input[type=file]').setInputFiles({name:'older-schedule.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
 const preview=page.getByRole('dialog',{name:'确认这份课表',exact:true});await preview.waitFor();assert.match(await preview.innerText(),new RegExp(`${expected} 个课程块 · [0-9]+ 节 · 21 周`));
 assert.equal(await page.locator('#import-date-value').innerText(),'2026/08/31');
 await preview.locator('.term-date-trigger').click();const calendar=page.getByRole('dialog',{name:'学期开始日期',exact:true});await calendar.getByRole('button',{name:'下个月',exact:true}).click();await calendar.getByRole('button',{name:'2026-09-01',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();
 await goTab(page,'搜索');assert.equal(await page.locator('.screen.active .result-card').count(),expected);
 await page.reload();await goTab(page,'搜索');assert.equal(await page.locator('.screen.active .result-card').count(),expected);
 const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>resolve({term:q.result.schedule.term,courses:q.result.schedule.courses.length,periods:q.result.schedule.periods.length});};}));
 assert.equal(saved.term.startDate,'2026-09-01');assert.equal(saved.term.weeks,21);assert.equal(saved.courses,expected);report.checks.push(`${old?'旧版真实':'合成旧格式'} JSON 文件 → 21 周预览 → 修改日期 → 落库 → 搜索 → 刷新`);
 const html='<html><meta charset="UTF-8"><table><tr><th>节次</th><th>星期一</th><th>星期二</th></tr><tr><td>第1-2节 08:30-09:55</td><td>数学<br>教师：张老师<br>教室：A201<br>周次：1-21周</td><td></td></tr><tr><td>第中午1-中午2节 12:10-13:35</td><td></td><td>午间实践<br>教师：林老师<br>教室：B103<br>周次：21周</td></tr></table><script>window.injected=true</script></html>';
 await openImport();await page.locator('.screen.active input[type=file]').setInputFiles({name:'grid.html',mimeType:'text/html',buffer:Buffer.from(html)});
 await page.getByRole('dialog',{name:'读取课表'}).getByRole('alert').waitFor();assert.match(await page.locator('dialog[open]').innerText(),/无法自动识别.*支持 JSON/s);assert.equal(await page.evaluate(()=>window.injected),undefined);await page.getByRole('dialog',{name:'读取课表'}).getByRole('button',{name:'取消',exact:true}).click();await goTab(page,'搜索');assert.equal(await page.locator('.screen.active .result-card').count(),expected);
 report.checks.push('HTML 文件被明确拒绝，脚本不执行且原 JSON 课程保持完整');
 await openImport();await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill('以下是课表：\n```json\n'+JSON.stringify({term:'2027-2028-1',courses:[{name:'练习课',day:'周三',period:'1-2',weeks:'21'}]})+'\n```');await page.getByRole('button',{name:'解析并预览',exact:true}).click();
 assert.match(await page.locator('dialog[open]').innerText(),/1 个课程块 · \d+ 节 · 21 周/);assert.equal(await page.locator('#import-date-value').innerText(),'2026/09/01');report.checks.push('前置说明 + JSON 围栏粘贴 → 保留原开学日期');
 await page.getByRole('button',{name:'返回修改',exact:true}).click();
 await page.evaluate(()=>{const original=File.prototype.arrayBuffer;window.__finishFileReads=[];File.prototype.arrayBuffer=function(){const file=this;return new Promise(resolve=>window.__finishFileReads.push(()=>resolve(original.call(file))));};});
 const pending={name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({courses:[{name:'延迟课',day:1,start:1,end:2,weeks:[1]}]}))};
 await page.locator('.screen.active input[type=file]').setInputFiles(pending);
 await page.getByRole('button',{name:'取消读取',exact:true}).click();
 await page.evaluate(()=>{for(const done of window.__finishFileReads)done();window.__finishFileReads=[];});
 await page.waitForTimeout(100);
 assert.equal(await page.getByRole('dialog',{name:'确认这份课表',exact:true}).count(),0);
 await page.locator('.screen.active input[type=file]').setInputFiles(pending);
 await page.evaluate(()=>{for(const done of window.__finishFileReads)done();window.__finishFileReads=[];});
 await page.getByRole('dialog',{name:'确认这份课表',exact:true}).waitFor();
 assert.match(await page.getByRole('dialog',{name:'确认这份课表',exact:true}).innerText(),/延迟课/);
 await page.getByRole('button',{name:'返回修改',exact:true}).click();
 await page.getByRole('dialog',{name:'读取课表',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
 report.checks.push('取消未完成读取后不出现过期预览，同一文件重新选择可正常解析');
 const beforeConfig=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result.schedule.courses);r.result.close();};};}));
 await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({term:{startDate:'2026-09-07',weeks:30},courseCount:1,firstStart:'08:20'}));
 await page.getByRole('button',{name:'解析并预览',exact:true}).click();
 assert.match(await page.getByRole('dialog',{name:'确认这份课表',exact:true}).innerText(),/仅更新课表配置/);
 await page.getByRole('button',{name:'确认导入',exact:true}).click();
 await page.getByRole('dialog',{name:'确认这份课表',exact:true}).waitFor({state:'hidden'});
 await page.reload();
 const configured=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{resolve(q.result.schedule);r.result.close();};};}));
 assert.deepEqual(configured.courses,beforeConfig);assert.equal(configured.periods.length,1);assert.equal(configured.periods[0].start,'08:20');assert.equal(configured.term.startDate,'2026-09-07');assert.equal(configured.term.weeks,30);
 report.checks.push('仅配置 JSON → 确认 → 刷新，日期时间与节数更新，高节次课程及 ID 原样保留');
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const tx=r.result.transaction('state','readwrite'),store=tx.objectStore('state'),q=store.get('app');q.onsuccess=()=>store.put({...q.result,schedule:{...q.result.schedule,courses:[]}},'app');tx.oncomplete=()=>{r.result.close();resolve();};};}));
 await page.reload();await openImport();
 await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({courseCount:8}));await page.getByRole('button',{name:'解析并预览',exact:true}).click();
 assert.match(await page.getByRole('dialog',{name:'确认这份课表',exact:true}).innerText(),/0 个课程块 · 8 节/);
 await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.getByRole('dialog',{name:'确认这份课表',exact:true}).waitFor({state:'hidden'});
 report.checks.push('空课表可单独导入有效节数配置，确认后不生成课程');
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/import-ui-results.json',JSON.stringify({...report,saved,errors},null,2));
 console.log(`PASS 导入全链路 ${report.checks.length} 项；旧版 JSON ${expected} 门、中午节次、HTML 拒绝、日期自动修正与持久化`);
}finally{await browser.close();}
