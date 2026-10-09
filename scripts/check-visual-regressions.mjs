import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];

const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:Number(process.env.TEST_DPR??1)});
const results=[];
try{
  await mkdir('build/evidence',{recursive:true});
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  assert.equal(await page.locator('.dock,#glass-droplet').count(),0);
  const host=await page.locator('.screen-host').boundingBox(),navigation=await page.locator('.primary-navigation').boundingBox();assert.ok(host.y+host.height<=navigation.y+1);results.push({solidNavigation:true,contentReserved:true});
  await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(350);
  assert.equal(await page.locator('#contour-background').count(),0);
  assert.equal(await page.locator('.app-background').evaluate(e=>getComputedStyle(e).position),'absolute');
  // Freeze the compositor animation at 95%: the screen should already be almost transparent.
  const fade=await page.evaluate(()=>{
    window.dolphinBack('start',0,0,.75);window.dolphinBack('progress',.55);window.dolphinBack('commit');
    const screen=document.querySelector('.screen.active'),animation=screen.getAnimations()[0];animation.pause();animation.currentTime=200;
    return {opacity:Number(getComputedStyle(screen).opacity),filter:getComputedStyle(screen).filter,origin:screen.style.transformOrigin,frames:animation.effect.getKeyframes()};
  });
  assert.ok(fade.opacity<.02);assert.equal(fade.filter,'none');assert.ok(fade.frames.every(frame=>!('filter' in frame)));assert.equal(fade.origin,'0px 633px');
  await page.evaluate(()=>document.querySelector('.screen.active').getAnimations()[0].finish());await page.waitForTimeout(100);
  assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'settings');assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('gesturing')),false);
  // Popping a nested route must not replay the parent's slide-in animation.
  await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();await page.waitForTimeout(400);
  await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.waitForTimeout(240);
  assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'editor');
  assert.equal(await page.locator('.screen.active').evaluate(e=>getComputedStyle(e).animationName),'none');
  await goTab(page,'设置');
  await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(400);
  await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('progress',.4);window.dolphinBack('commit');window.dolphinBack('commit');});
  await goTab(page,'列表');await page.waitForTimeout(400);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'list');
  await page.screenshot({path:`build/evidence/${version}-home-light.png`});
  await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(350);
  await page.screenshot({path:`build/evidence/${version}-appearance.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.dolphinBack('back'));await page.waitForTimeout(100);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'settings');
  await goTab(page,'列表');await page.locator('html').evaluate(e=>e.dataset.mode='dark');await page.screenshot({path:`build/evidence/${version}-home-dark.png`});
  await writeFile(`build/evidence/${version}-visual-results.json`,JSON.stringify({version,navigation:results,fade,fixedBackground:true,interruptedBackSafe:true,reducedMotion:true},null,2));
  console.log('PASS solid navigation reserves content, continuous fade, interruption, reduced motion, fixed background');
}finally{await browser.close();}
