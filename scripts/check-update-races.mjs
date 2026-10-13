import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';
const browser=await launchBrowser(),checks=[],errors=[];
const old={installed:'1.4.9',available:true,busy:false,checkedAt:1,message:'旧缓存',release:{version:'v8.0.0',url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v8.0.0',notes:'old'}};
const fresh={tag_name:'v9.0.0',html_url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v9.0.0',body:'fresh',draft:false,prerelease:false};
try{
 for(const scenario of ['late-cache','removed-release','cache-during-failure','failure-then-cache']){
  let finishAPI;
  const context=await browser.newContext();const page=await context.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/lib/storage.ts*',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body.replace('export async function loadReleaseCache(', 'async function originalLoadReleaseCache(')+`\nexport async function loadReleaseCache(){return new Promise(resolve=>{window.releaseCacheRead=()=>resolve(${JSON.stringify(old)});});}\n`});});
  await page.route('https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest',async route=>{
   if(scenario.includes('failure')||scenario.includes('then-cache')){await new Promise(resolve=>finishAPI=resolve);return route.fulfill({status:500,json:{message:'Unavailable'}});}
   return scenario==='removed-release'?route.fulfill({status:404,json:{message:'Not Found'}}):route.fulfill({json:fresh});
  });
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  await goTab(page,'设置');await page.locator('[data-setting=about]').click();await page.getByRole('button',{name:'应用更新',exact:false}).click();
  await page.locator('#auto-update').click();await page.waitForFunction(()=>document.querySelector('#auto-update')?.checked===false);
  if(scenario==='removed-release'){await page.evaluate(()=>window.releaseCacheRead());await page.getByText(/最新 v8.0.0/).waitFor();}
  await page.getByRole('button',{name:'立即检查更新',exact:true}).click();
  if(scenario==='late-cache'){
   await page.getByText(/最新 v9.0.0/).waitFor();await page.evaluate(()=>window.releaseCacheRead());await page.waitForTimeout(200);
   assert.match(await page.locator('.update-summary').innerText(),/最新 v9.0.0/);assert.doesNotMatch(await page.locator('.update-summary').innerText(),/v8.0.0/);
   checks.push('迟到的旧版本缓存不能覆盖已完成的手动检查');
  }else if(scenario==='removed-release'){
   await page.getByText('GitHub 尚未发布正式版本',{exact:true}).waitFor();assert.equal(await page.getByText(/最新 v8.0.0/).count(),0);
   const cached=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('release');q.onsuccess=()=>{resolve(q.result);db.close();};};}));assert.equal(cached.available,false);assert.equal(cached.release,undefined);
   checks.push('正式版本被删除的404结果清除旧更新提示和缓存');
  }else{
   await page.getByRole('button',{name:'正在检查…',exact:true}).waitFor();
   if(scenario==='cache-during-failure'){await page.evaluate(()=>window.releaseCacheRead());await page.getByText(/最新 v8.0.0/).waitFor();assert.equal(await page.getByRole('button',{name:'正在检查…',exact:true}).isDisabled(),true);}
   assert.equal(typeof finishAPI,'function');finishAPI();await page.getByText('暂时无法检查更新，请稍后重试',{exact:true}).waitFor();
   if(scenario==='failure-then-cache'){await page.evaluate(()=>window.releaseCacheRead());await page.getByText(/最新 v8.0.0/).waitFor();}
   assert.match(await page.locator('.update-summary').innerText(),/最新 v8.0.0/);assert.match(await page.locator('.update-summary').innerText(),/暂时无法检查更新/);
   assert.equal(await page.getByRole('button',{name:'立即检查更新',exact:true}).isDisabled(),false);
   checks.push(scenario==='cache-during-failure'?'缓存读取不解除进行中的检查，失败仍保留已发现版本':'手动检查先失败后读取缓存，保留版本与本次失败反馈');
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/update-races-results.json',JSON.stringify({checks,errors},null,2));for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();}
