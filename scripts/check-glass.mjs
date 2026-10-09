// Compatibility entry: retired GlassDock checks now protect solid primary navigation.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';
const origin=await readFile('web/src/nav/useNavigation.ts','utf8');
const originGuard=s=>{assert.match(s,/originX:0\)\*innerWidth-rect.left/);assert.match(s,/originY:\.65\)\*innerHeight-rect.top/);assert.match(s,/current.style.animation='none'/);};
originGuard(origin);assert.throws(()=>originGuard(origin.replace('originY:.65)*innerHeight-rect.top','originY:.65)*innerHeight')));originGuard(origin);
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('.onboarding[data-step="2"]').waitFor();await page.waitForTimeout(200);await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('.onboarding[data-step="3"]').waitFor();const guide=await page.locator('dialog[open]').innerText();assert.match(guide,/背景毛玻璃/);assert.match(guide,/底部导航/);assert.match(guide,/侧边导航/);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 for(const mode of ['light','dark']){await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);const style=await page.locator('.primary-navigation').evaluate(e=>({background:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).backdropFilter}));assert.equal(style.filter,'none');assert.doesNotMatch(style.background,/rgba\([^)]*,\s*0(?:\.\d+)?\)/);assert.equal(await page.locator('.dock,#glass-droplet').count(),0);await goTab(page,'设置');await page.setViewportSize({width:390,height:640});const before=await page.locator('.primary-navigation').boundingBox();await page.locator('.screen.active').evaluate(e=>e.scrollTop=e.scrollHeight);assert.deepEqual(await page.locator('.primary-navigation').boundingBox(),before);await page.screenshot({path:'build/evidence/solid-navigation-'+mode+'.png'});await goTab(page,'列表');}
 assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/solid-navigation-results.json',JSON.stringify({backOriginMutationRejected:true,solidNavigation:true,scrollKeepsNavigation:true,errors},null,2));console.log('PASS 实体导航深浅色不使用透镜，滚动不改变栏位置；原生返回起点变异拒绝');
}finally{await browser.close();}
