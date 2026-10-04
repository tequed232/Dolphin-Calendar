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
  await page.locator('.dock[data-droplet-ready=true]').waitFor();
  const style=await page.addStyleTag({content:'.dock-droplet-rim{visibility:hidden!important}'});
  await page.evaluate(()=>{
    document.documentElement.dataset.performance='full';
    const pattern=document.createElement('div');pattern.id='pixel-grid';
    Object.assign(pattern.style,{position:'absolute',inset:'auto 0 0',height:'120px',zIndex:'19',background:'repeating-linear-gradient(90deg,#fa4620 0 5px,#2855d0 5px 10px,#fff 10px 15px)'});
    document.querySelector('.app-shell').append(pattern);
  });
  const dock=page.locator('.dock'),clip=page.locator('.dock-droplet-clip');
  async function spill(){
    const bounds=await dock.boundingBox(),capsule=await clip.boundingBox();
    const visible=await dock.screenshot();
    await clip.evaluate(e=>e.style.visibility='hidden');const hidden=await dock.screenshot();
    await clip.evaluate(e=>e.style.removeProperty('visibility'));
    await writeFile('build/evidence/clip-visible.png',visible);await writeFile('build/evidence/clip-hidden.png',hidden);await writeFile('build/evidence/clip-bounds.json',JSON.stringify({bounds,capsule}));
    return page.evaluate(async({images,bounds,capsule})=>{
      const decoded=await Promise.all(images.map(async src=>{const img=new Image();img.src=src;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return {w:img.width,h:img.height,p:ctx.getImageData(0,0,img.width,img.height).data};}));
      let outside=0,inside=0;const [a,b]=decoded,ratio=a.w/bounds.width,cx=capsule.x-bounds.x+capsule.width/2,cy=capsule.y-bounds.y+capsule.height/2,r=capsule.height/2;
      for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){
        const i=(y*a.w+x)*4,delta=Math.abs(a.p[i]-b.p[i])+Math.abs(a.p[i+1]-b.p[i+1])+Math.abs(a.p[i+2]-b.p[i+2]);
        if(delta<12)continue;
        const dx=Math.max(Math.abs((x+.5)/ratio-cx)-(capsule.width/2-r),0),dy=Math.abs((y+.5)/ratio-cy),distance=Math.hypot(dx,dy)-r;
        if(distance>2)outside++;else if(distance<-2)inside++;
      }
      return {outside,inside};
    },{images:[visible,hidden].map(x=>'data:image/png;base64,'+x.toString('base64')),bounds,capsule});
  }
  const bounds=await dock.boundingBox();
  for(const mode of ['light','dark']){
    await page.locator('html').evaluate((e,mode)=>{e.dataset.mode=mode;e.dataset.performance='full';},mode);
    await page.mouse.move(bounds.x+bounds.width/6,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.56,bounds.y+bounds.height/2,{steps:8});await page.waitForTimeout(750);
    const pixels=await spill();assert.ok(pixels.inside>100,`${mode}: glass must change real background pixels`);assert.equal(pixels.outside,0,`${mode}: rectangle leaked outside the rounded capsule`);
    results.push({mode,...pixels});
    await page.mouse.up();await page.waitForTimeout(500);
    const idle=await spill();assert.equal(idle.outside,0,`${mode}: idle capsule leaked`);results.push({mode:mode+'-idle',...idle});
  }
  // Deliberately remove clipping: the pixel test must catch the old rectangular surface.
  await page.locator('.dock-droplet-window').evaluate(e=>e.style.maskImage='none');const broken=await spill();assert.ok(broken.outside>80,'pixel guard must reject missing round clipping');await page.locator('.dock-droplet-window').evaluate(e=>e.style.removeProperty('mask-image'));
  await style.evaluate(e=>e.remove());await page.evaluate(()=>document.getElementById('pixel-grid').remove());
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(350);
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
  await page.locator('[data-setting="editor"]').click();await page.locator('.screen.active .import-entry').click();await page.waitForTimeout(400);
  await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.waitForTimeout(240);
  assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'editor');
  assert.equal(await page.locator('.screen.active').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(400);
  await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('progress',.4);window.dolphinBack('commit');window.dolphinBack('commit');});
  await page.getByRole('button',{name:'首页',exact:true}).click();await page.waitForTimeout(400);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'home');
  await page.screenshot({path:`build/evidence/${version}-home-light.png`});
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="appearance"]').click();await page.waitForTimeout(350);
  await page.screenshot({path:`build/evidence/${version}-appearance.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.dolphinBack('back'));await page.waitForTimeout(100);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'settings');
  await page.getByRole('button',{name:'首页',exact:true}).click();await page.locator('html').evaluate(e=>e.dataset.mode='dark');await page.screenshot({path:`build/evidence/${version}-home-dark.png`});
  await writeFile(`build/evidence/${version}-visual-results.json`,JSON.stringify({version,capsule:results,unclippedMutation:broken,fade,fixedBackground:true,interruptedBackSafe:true,reducedMotion:true},null,2));
  console.log('PASS rounded backdrop pixels in light/dark, unclipped mutation rejected, continuous fade, interruption, reduced motion, fixed background');
}finally{await browser.close();}
