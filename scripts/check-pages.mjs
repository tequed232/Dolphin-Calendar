import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchBrowser} from './check-browser.mjs';

const root=path.resolve('build/pages'),prefix='/Dolphin-Calendar/';
const html=await readFile(path.join(root,'index.html'),'utf8');
assert.match(html,/<script type="module">/);
assert.doesNotMatch(html,/<script[^>]+src=|src\/main\.tsx/);
const misses=[];
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(prefix))throw new Error('outside project');
    const filename=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
    if(!filename.startsWith(root+path.sep))throw new Error('outside build');
    const body=await readFile(filename);
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]??'application/octet-stream'});res.end(body);
  }catch{misses.push(req.url);res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+prefix;
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin)&&/^https?:/.test(request.url()))external.push(request.url());});
try{
  await page.goto(url);
  await page.evaluate(()=>caches.open('dolphin-other-project-preserve'));
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  assert.equal(await page.locator('.brand-art').first().evaluate(img=>img.complete&&img.naturalWidth>0),true);
  const icons=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')].map(async link=>{const img=new Image();img.src=link.href;await img.decode();return img.naturalWidth;})));
  assert.deepEqual(icons,[32,180]);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="editor"]').click();await page.locator('.screen.active .import-entry').click();
  await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({term:{name:'Pages 演示',startDate:'2026-09-28',weeks:30},courses:[{name:'网页导入验证',teacher:'示例教师',room:'16栋203号教室',day:3,start:3,end:4,weeks:[1,2,3]}]}));
  await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.locator('[data-screen="home"].active').waitFor();
  await page.reload();await page.getByRole('button',{name:'搜索',exact:true}).click();await page.locator('.screen.active .result-card').waitFor();assert.match(await page.locator('.screen.active .result-card').innerText(),/网页导入验证/);
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,url);
  await page.reload();
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
  assert.equal(await page.evaluate(()=>caches.has('dolphin-other-project-preserve')),true);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'搜索',exact:true}).click();await page.locator('.screen.active .result-card').waitFor();
  assert.deepEqual(misses,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await mkdir('build/evidence',{recursive:true});await page.screenshot({path:'build/evidence/1.4.2-pages.png'});
  await writeFile('build/evidence/1.4.2-pages-results.json',JSON.stringify({entry:'index.html',subdirectory:prefix,icons,imported:true,persisted:true,offline:true,scope,otherCachePreserved:true,misses,errors,external},null,2));
  console.log('PASS Pages index.html / 项目子目录资源 / JSON 导入与刷新 / 离线缓存隔离');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
