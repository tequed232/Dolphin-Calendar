import {goTab,pasteJSON} from './check-navigation.mjs';
import {launchBrowser} from './check-browser.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser();const page=await browser.newPage({viewport:{width:360,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const external=[];page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
try{
 await page.goto(pathToFileURL(path.resolve('web/dist/Dolphin-Calendar-offline.html')).href);
 await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 assert.equal(await page.locator('.brand-art').first().evaluate(img=>img.complete&&img.naturalWidth>0),true);
 const defaultBackground=await page.locator('.background-photo').evaluate(async el=>{const src=getComputedStyle(el).backgroundImage.slice(5,-2),image=new Image();image.src=src;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,protocol:new URL(src).protocol};});assert.deepEqual(defaultBackground,{width:941,height:1672,protocol:'file:'});assert.equal(await page.locator('.app-background').getAttribute('data-source'),'default');
 assert.equal(await page.locator('.dock svg[data-icon]').count(),4);assert.ok(external.every(url=>url==='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest'));assert.deepEqual(errors,[]);
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();
 await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill('<table><tr><td>线性代数</td></tr></table>');await page.getByRole('button',{name:'解析并预览',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/有效的 JSON/);await page.getByRole('button',{name:'知道了',exact:true}).click();
 const schedule={term:{name:'离线验证',startDate:'2026-09-28',weeks:20},courses:[{name:'线性代数',teacher:'陈老师',room:'16栋203号教室',day:5,start:3,end:4,weeks:[1,2,3]}]};await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(schedule));await page.getByRole('button',{name:'解析并预览',exact:true}).click();assert.match(await page.locator('dialog[open]').innerText(),/线性代数/);await page.getByRole('button',{name:'确认导入',exact:true}).click();
 // Import from management returns to management after its data transaction completes.
 await page.locator('.screen.active[data-screen="editor"]').waitFor();await goTab(page,'列表');
 await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();assert.equal(await page.locator('.screen.active .result-card').count(),1);
 assert.ok(external.every(url=>url==='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest'));
 await page.screenshot({path:`build/evidence/${version}-offline.png`});await writeFile(`build/evidence/${version}-offline-results.json`,JSON.stringify({version,completed:true,openedFromFile:true,externalRequests:external,iconsLocal:true,brandLoaded:true,defaultBackground,jsonImported:true,htmlRejected:true,persisted:true,errors},null,2));console.log('PASS 双击离线网页 / 本地图标与默认插画 / JSON导入 / 刷新持久化 / 仅官方版本检查请求');
}finally{await browser.close();}
