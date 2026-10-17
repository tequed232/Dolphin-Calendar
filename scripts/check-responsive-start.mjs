import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const browser=await launchBrowser(),checks=[],errors=[];
try{
 for(const mutation of [true,false]){
  const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   const original=window.matchMedia;let snapshots=0;
   window.matchMedia=function(query){
    const media=original.call(window,query);
    // Both Home instances render before effects subscribe. Simulate orientation
    // changing in that gap, without delivering an already-missed change event.
    if(query==='(orientation:landscape) and (min-width:480px)'&&snapshots++<2)
     return new Proxy(media,{get(target,key){if(key==='matches')return false;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    return media;
   };
  });
  let mutated=false;
  if(mutation)await page.route('**/src/screens/Home.tsx*',async route=>{
   const response=await route.fetch(),source=await response.text();
   const broken=source.replace(/query\.addEventListener\("change", refresh\);\s*refresh\(\);/,'query.addEventListener("change", refresh);');
   assert.notEqual(broken,source,'方向初始化变异必须实际修改代码');mutated=true;await route.fulfill({response,body:broken});
  });
  await page.route('https://api.github.com/**',route=>route.fulfill({status:503,body:'fixture'}));
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  const strip=page.locator('[data-screen=list] .date-strip');
  if(mutation){assert.equal(mutated,true,'必须验证变异后的实际页面');await page.waitForTimeout(500);assert.equal(await strip.getAttribute('data-orientation'),'horizontal');checks.push('去掉订阅后的初始化读取，能复现方向快照过期');}
  else{
   await page.waitForFunction(()=>document.querySelector('[data-screen=list] .date-strip')?.dataset.orientation==='vertical');
   await page.setViewportSize({width:390,height:844});
   await page.waitForFunction(()=>document.querySelector('[data-screen=list] .date-strip')?.dataset.orientation==='horizontal');
   checks.push('首帧方向变化和随后旋转都更新到正确日期栏方向');
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(checks.map(check=>'PASS '+check).join('\n'));
}finally{await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/responsive-start.json',JSON.stringify({checks,errors,success:checks.length===2&&!errors.length},null,2));await browser.close();}
