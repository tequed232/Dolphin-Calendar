import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as XLSX from '@e965/xlsx';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';
const root=path.resolve('web/dist'),checks=[],errors=[],requests=[];
const server=createServer(async(request,response)=>{try{
 const target=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
 if(target!==root&&!target.startsWith(root+path.sep))throw new Error('outside root');
 response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(target)]??'text/html');
 response.end(await readFile(target===root?path.join(root,'index.html'):target));
}catch{response.statusCode=404;response.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await launchBrowser();
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['课程名','星期','节次','周次'],['延迟加载验证','周一','1-2','1-16']]),'课表');
const workbook=Buffer.from(XLSX.write(book,{bookType:'xlsx',type:'buffer'}));
try{
 for(const offline of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push({offline,url:request.url()}));
  await page.route('https://api.github.com/**',route=>route.fulfill({status:503,body:'fixture'}));
  await page.goto(offline?pathToFileURL(path.join(root,'Dolphin-Calendar-offline.html')).href:base);
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  if(!offline){assert.equal(requests.some(item=>item.url.includes('/Import-')),false);checks.push('HTTP首屏不请求导入与Excel代码');}
  await goTab(page,'列表');await page.locator('.screen.active').getByRole('button',{name:'导入课表',exact:true}).click();
  const importer=page.locator('[data-screen=import].active');
  await importer.getByLabel('选择课表文件',{exact:true}).setInputFiles({name:'audit.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook});
  const preview=page.getByRole('dialog',{name:'确认这份课表',exact:true});await preview.waitFor();assert.match(await preview.innerText(),/延迟加载验证/);
  if(!offline)assert.ok(requests.some(item=>item.url.includes('/Import-')));
  await preview.getByRole('button',{name:'确认导入',exact:true}).click();await importer.waitFor({state:'hidden'});
  await goTab(page,'搜索');assert.match(await page.locator('.screen.active .result-card').innerText(),/延迟加载验证/);
  await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();assert.equal(await page.locator('.screen.active .result-card').count(),1);
  checks.push(`${offline?'双击离线':'HTTP分块'}：Excel导入、搜索与刷新持久化`);
  await page.screenshot({path:`build/evidence/audit-import-${offline?'offline':'http'}.png`});await context.close();
 }
 assert.deepEqual(errors,[]);assert.ok(requests.filter(item=>item.offline&&/^https?:/.test(item.url)).every(item=>item.url.startsWith('https://api.github.com/')));
 console.log(checks.map(check=>'PASS '+check).join('\n'));
}finally{
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/import-loading.json',JSON.stringify({checks,errors,requests,success:checks.length===3&&!errors.length},null,2));
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
