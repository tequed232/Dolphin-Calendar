import {goTab,pasteJSON} from './check-navigation.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchBrowser} from './check-browser.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const root=path.resolve('build/pages'),prefix='/Dolphin-Calendar/';
const html=await readFile(path.join(root,'index.html'),'utf8');
assert.match(html,/<script type="module">/);
assert.doesNotMatch(html,/<script[^>]+src=|src\/main\.tsx/);
const misses=[];
let legacyWorker=true;
const legacyScript=`const CACHE='dolphin-'+self.registration.scope+'-legacy';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&e.request.url.startsWith(self.registration.scope))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(c=>c||fetch(e.request)));});`;
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(prefix))throw new Error('outside project');
    const filename=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
    if(!filename.startsWith(root+path.sep))throw new Error('outside build');
    const body=legacyWorker&&filename===path.join(root,'sw.js')?legacyScript:await readFile(filename);
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]??'application/octet-stream'});res.end(body);
  }catch{misses.push(req.url);res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+prefix;
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const releaseEndpoint='https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest';
await page.route(releaseEndpoint,route=>route.fulfill({json:{tag_name:'v1.4.3',html_url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v1.4.3',draft:false,prerelease:false}}));
const errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin)&&/^https?:/.test(request.url()))external.push(request.url());});
try{
  await page.goto(url);
  await page.evaluate(()=>caches.open('dolphin-other-project-preserve'));
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  assert.equal(await page.locator('.today-fab').count(),0);
  const today=page.locator('.week-controls').getByRole('button',{name:'回到今天',exact:true});
  const homeDate=()=>page.locator('.screen.active .home-inner').getAttribute('data-focus-date'),homeTitle=()=>page.locator('.screen.active .day-heading h1').innerText(),currentDate=await homeDate(),currentTitle=await homeTitle();
  await page.getByRole('button',{name:'下一周',exact:true}).click();assert.notEqual(await homeDate(),currentDate);assert.notEqual(await homeTitle(),currentTitle);
  await today.click();assert.equal(await homeDate(),currentDate);assert.equal(await homeTitle(),currentTitle);
  await page.setViewportSize({width:320,height:800});
  assert.equal(await page.locator('.month-row').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('.brand-art').first().evaluate(img=>img.complete&&img.naturalWidth>0),true);
  const icons=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')].map(async link=>{const img=new Image();img.src=link.href;await img.decode();return img.naturalWidth;})));
  assert.deepEqual(icons,[32,180]);
  await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();
  await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify({term:{name:'Pages 演示',startDate:'2026-09-28',weeks:30},courses:[{name:'网页导入验证',teacher:'示例教师',room:'16栋203号教室',day:3,start:3,end:4,weeks:[1,2,3]}]}));
  await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.locator('.screen.active[data-screen="editor"]').waitFor();await goTab(page,'列表');
  await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();assert.match(await page.locator('.screen.active .result-card').innerText(),/网页导入验证/);
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,url);
  await page.reload();
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
  assert.equal(await page.evaluate(()=>caches.has('dolphin-other-project-preserve')),true);
  await page.evaluate(async()=>{
    const prefix='dolphin-'+(await navigator.serviceWorker.ready).scope+'-';
    const cache=await caches.open((await caches.keys()).find(key=>key.startsWith(prefix)));
    for(const relative of ['./','./index.html'])await cache.put(new URL(relative,location.href).href,new Response('<html><head><link rel="icon" href="data:,"></head><body>stale-home</body></html>',{headers:{'Content-Type':'text/html'}}));
  });
  await page.reload();assert.match(await page.locator('body').innerText(),/stale-home/);
  legacyWorker=false;
  await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    await registration.update();await changed;
  });
  await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();assert.match(await page.locator('.screen.active .result-card').innerText(),/网页导入验证/);
  await page.evaluate(async()=>{
    const prefix='dolphin-'+(await navigator.serviceWorker.ready).scope+'-';
    const cache=await caches.open((await caches.keys()).find(key=>key.startsWith(prefix)));
    await cache.put(new URL('./',location.href).href,new Response('<html><head><link rel="icon" href="data:,"></head><body>stale-home</body></html>',{headers:{'Content-Type':'text/html'}}));
  });
  await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();
  await context.setOffline(true);await page.reload();await goTab(page,'搜索');await page.locator('.screen.active .result-card').waitFor();
  assert.deepEqual(misses,[]);assert.deepEqual(errors,[]);assert.ok(external.every(request=>request===releaseEndpoint),'仅允许产品明确实现的官方版本检查请求');
  await mkdir('build/evidence',{recursive:true});await page.screenshot({path:`build/evidence/${version}-pages.png`});
  await writeFile(`build/evidence/${version}-pages-results.json`,JSON.stringify({version,entry:'index.html',subdirectory:prefix,icons,imported:true,persisted:true,offline:true,scope,otherCachePreserved:true,misses,errors,external},null,2));
  console.log('PASS Pages index.html / 项目子目录资源 / JSON 导入与刷新 / 离线缓存隔离');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
