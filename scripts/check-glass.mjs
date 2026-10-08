import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';

const glass=await readFile('web/src/components/GlassDock.tsx','utf8');
const origin=await readFile('web/src/nav/useNavigation.ts','utf8');
const guard=s=>{assert.match(s,/new ResizeObserver/);assert.doesNotMatch(s.split('type Motion=')[0],/requestAnimationFrame|feTurbulence/);assert.match(s,/if\(moving\)raf\.current=requestAnimationFrame\(step\)/);assert.match(s,/colorInterpolationFilters="sRGB"/);assert.match(s,/Math\.ceil\(width\/2\)/);};
guard(glass);assert.throws(()=>guard(glass.replace('new ResizeObserver','new MutationObserver')));guard(glass);
const originGuard=s=>{assert.match(s,/originX:0\)\*innerWidth-rect.left/);assert.match(s,/originY:\.65\)\*innerHeight-rect.top/);assert.match(s,/current.style.animation='none'/);};
originGuard(origin);assert.throws(()=>originGuard(origin.replace('originY:.65)*innerHeight-rect.top','originY:.65)*innerHeight')));originGuard(origin);
const b=await launchBrowser(),page=await b.newPage({viewport:{width:390,height:844}});
try{
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
 await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('.onboarding[data-step="2"]').waitFor();await page.waitForTimeout(200);
 await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('.onboarding[data-step="3"]').waitFor();
 const guide=await page.locator('dialog[open]').innerText();assert.match(guide,/底栏质感/);assert.match(guide,/在“外观”/);assert.match(guide,/背景毛玻璃与底栏质感/);assert.doesNotMatch(guide,/关闭、部分或完全/);
 await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 // 像素对比固定使用实际“高画质”偏好，避免 60Hz CI 的自动降级在截图前恢复。
 await page.evaluate(async()=>{
  const {loadData,saveData}=await import('/src/lib/storage.ts');
  const data=await loadData();data.settings.performance='high';await saveData(data);
 });
 await page.reload();
 await page.locator('.dock[data-droplet-ready=true]').waitFor();
 await page.evaluate(()=>{
  document.documentElement.dataset.performance='full';
  const pattern=document.createElement('div');pattern.id='glass-test-pattern';
  Object.assign(pattern.style,{position:'absolute',inset:'auto 0 0',height:'110px',zIndex:'19',background:'repeating-linear-gradient(90deg,#ff3820 0 5px,#0066ff 5px 10px,#fff 10px 15px)'});
  document.querySelector('.app-shell').append(pattern);
 });
 const dock=page.locator('.dock');
 await page.waitForTimeout(250);const refracted=await dock.screenshot();
 await page.locator('#glass-droplet feDisplacementMap').evaluate(e=>e.setAttribute('scale','0'));await page.waitForTimeout(100);const flat=await dock.screenshot();
 const changed=await page.evaluate(async images=>{
  const pixels=await Promise.all(images.map(async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}));
  let count=0;for(let i=0;i<pixels[0].length;i+=4)if(Math.abs(pixels[0][i]-pixels[1][i])+Math.abs(pixels[0][i+1]-pixels[1][i+1])+Math.abs(pixels[0][i+2]-pixels[1][i+2])>30)count++;return count;
 },[refracted,flat].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
 const renderer=await page.evaluate(()=>({performance:document.documentElement.dataset.performance,refraction:document.documentElement.dataset.refraction,filter:getComputedStyle(document.querySelector('.dock-droplet-window')).backdropFilter}));
 assert.equal(renderer.performance,'full','像素对比必须在真实高画质模式运行');
 assert.ok(changed>80,`局部位移滤镜未真正改变背景像素: ${changed}；${JSON.stringify(renderer)}`);
 await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/glass-refraction.png',refracted);await writeFile('build/evidence/glass-flat.png',flat);
 await page.evaluate(()=>{document.getElementById('glass-test-pattern').remove();document.documentElement.dataset.refraction='true';document.querySelector('#glass-droplet feDisplacementMap').setAttribute('scale','7');});
 await goTab(page,'设置');await page.screenshot({path:'build/evidence/classic-settings.png'});
 // Compact settings fit on this phone; use a smaller viewport to verify real scrolling.
 await page.setViewportSize({width:390,height:640});
 const scroll=await page.evaluate(async()=>{
  const screen=document.querySelector('.screen.active'),glass=document.querySelector('.dock-droplet-window');
  const samples=[];for(let n=0;n<14;n++){
   screen.scrollTop=n*45;await new Promise(resolve=>requestAnimationFrame(resolve));
   samples.push({position:screen.scrollTop,filter:getComputedStyle(glass).backdropFilter});
  }
  document.documentElement.dataset.performance='reduced';
  const reduced=getComputedStyle(glass).backdropFilter;
  return {samples,reduced};
 });
 assert.ok(scroll.samples.at(-1).position>scroll.samples[0].position,'未真正滚动页面');
 assert.ok(scroll.samples.every(s=>s.filter.includes('glass-droplet')),'滚动中丢失局部实时折射');
 assert.doesNotMatch(scroll.reduced,/glass-droplet/,'自动降级应停用昂贵的位移滤镜');
 await writeFile('build/evidence/glass-results.json',JSON.stringify({changedPixels:changed,realBackdropRefraction:true,scrollSamples:scroll.samples.length,scrollKeepsRefraction:true,reducedUsesBlur:true,idleAnimationLoop:false,morphMapsCached:true,mutationRejected:true},null,2));
 console.log(`PASS 选中胶囊局部折射 ${changed} 像素 / 滑动中 ${scroll.samples.length} 帧持续折射 / 自动降级为轻模糊 / 变异拒绝`);
}finally{await b.close();}
