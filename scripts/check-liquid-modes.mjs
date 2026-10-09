// HISTORICAL: transparent Dock/glass flow. Checkout the relevant old tag to reproduce.
// 1.4.5 uses check-native-navigation.mjs, check-responsive-navigation.mjs and current business CI.
import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const checks=[],errors=[],contrastResults=[],capsuleResults=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const active=()=>page.locator('.screen.active');
await mkdir('build/evidence',{recursive:true});
async function settled(){await page.waitForTimeout(650);await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});}
async function seed(settings){
  await page.evaluate(async settings=>{
    const {initialData,sampleSchedule}=await import('/src/lib/model.ts'),data=initialData();
    data.onboarded=true;data.schedule=sampleSchedule();data.schedule.term.startDate='2026-09-28';data.books={'大学英语':{title:'英语教材',publisher:'本地测试',edition:'第一版',text:'',source:'manual'}};
    Object.assign(data.settings,{mode:'light',performance:'high'},settings);
    if(settings.glassMode===null)delete data.settings.glassMode;
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },settings);
  await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await active().waitFor();await page.waitForTimeout(120);
}
async function data(){return page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const value=await new Promise(resolve=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result);});db.close();return value;});}
async function appearance(){await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();await page.getByRole('button',{name:'液态玻璃模式',exact:true}).waitFor();}
async function chooseMode(mode){
  const label={off:'关闭 · 纯色界面',partial:'部分 · 底栏',full:'完全 · 全界面'}[mode];
  await page.getByRole('button',{name:'液态玻璃模式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();
  await page.waitForFunction(mode=>document.documentElement.dataset.glassMode===mode,mode);
}
async function material(){return page.locator('.date-panel').evaluate(el=>({color:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).backdropFilter}));}
function alphaBlend(front,back){const alpha=front[3]/255;return front.slice(0,3).map((value,index)=>value*alpha+back[index]*(1-alpha));}
function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function contrastSamples(){return page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  function color(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);}
  const root=getComputedStyle(document.documentElement),veil=color(root.getPropertyValue('--background-veil').trim()||'#f5f6f7b8');
  return {veil,samples:['.date-panel','.course-card','.secondary'].map(selector=>{const el=document.querySelector(selector);if(!el)return null;const style=getComputedStyle(el),text=selector==='.course-card'?el.querySelector('.course-meta'):selector==='.date-panel'?el.querySelector('.date-panel-hint'):el;return {selector,background:color(style.backgroundColor),text:color(getComputedStyle(text).color),filter:style.backdropFilter};}).filter(Boolean)};
});}
async function capsuleSpill(){
  const dock=page.locator('.dock'),clip=page.locator('.dock-droplet-clip'),bounds=await dock.boundingBox(),capsule=await clip.boundingBox();
  const visible=await dock.screenshot();await clip.evaluate(el=>el.style.visibility='hidden');const hidden=await dock.screenshot();await clip.evaluate(el=>el.style.removeProperty('visibility'));
  return page.evaluate(async({images,bounds,capsule})=>{
    const values=await Promise.all(images.map(async source=>{const image=new Image();image.src=source;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,pixels:ctx.getImageData(0,0,image.width,image.height).data};}));
    const [a,b]=values,ratio=a.width/bounds.width,cx=capsule.x-bounds.x+capsule.width/2,cy=capsule.y-bounds.y+capsule.height/2,r=capsule.height/2;let inside=0,outside=0;
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4,delta=Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2]);if(delta<12)continue;const dx=Math.max(Math.abs((x+.5)/ratio-cx)-(capsule.width/2-r),0),dy=Math.abs((y+.5)/ratio-cy),distance=Math.hypot(dx,dy)-r;if(distance>2)outside++;else if(distance<-2)inside++;}
    return {inside,outside};
  },{images:[visible,hidden].map(value=>'data:image/png;base64,'+value.toString('base64')),bounds,capsule});
}
try{
  await page.clock.setFixedTime(new Date(2026,8,29,9));await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.locator('.load-note').waitFor({state:'hidden'});
  await seed({glass:true,glassMode:null});assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'partial');assert.match((await material()).filter,/^none$/);
  await appearance();assert.match(await page.getByRole('button',{name:'液态玻璃模式',exact:true}).innerText(),/部分/);
  pass('旧版 glass=true 数据迁移为部分模式，主页课程与教材完整保留');
  await seed({glass:false,glassMode:null});assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'off');assert.equal(await page.locator('.dock').evaluate(el=>getComputedStyle(el,'::before').backdropFilter),'none');
  assert.equal((await data()).schedule.courses.length,7);assert.equal((await data()).books['大学英语'].title,'英语教材');
  pass('旧版 glass=false 保持关闭，升级不会擅自开启玻璃');

  await appearance();
  for(const mode of ['partial','full','off']){
    await chooseMode(mode);const saved=await data();assert.equal(saved.settings.glassMode,mode);assert.equal(saved.settings.glass,mode!=='off');
    await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});assert.equal(await page.locator('html').getAttribute('data-glass-mode'),mode);
    const surface=await material();assert.equal(surface.filter==='none',mode!=='full');
    const alpha=await page.locator('.date-panel').evaluate(el=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3];});assert.equal(alpha<255,mode==='full');
    assert.equal((await data()).schedule.courses.length,7);assert.equal((await data()).books['大学英语'].title,'英语教材');await appearance();
  }
  pass('关闭、部分、完全都是真实生效模式，重启持久化且玻璃布尔值同步');

  await page.evaluate(()=>{window.__liquidOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('测试保存失败','QuotaExceededError');};});
  await page.getByRole('button',{name:'液态玻璃模式',exact:true}).click();await page.getByRole('option',{name:'完全 · 全界面',exact:true}).click();
  await page.getByRole('status').filter({hasText:'保存失败：测试保存失败'}).waitFor();assert.equal(await page.locator('html').getAttribute('data-glass-mode'),'off');assert.match(await page.getByRole('button',{name:'液态玻璃模式',exact:true}).innerText(),/关闭/);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__liquidOriginalPut;delete window.__liquidOriginalPut;});assert.equal((await data()).settings.glassMode,'off');
  pass('玻璃模式保存失败时告知错误并保留旧模式，没有未处理的 Promise 拒绝');

  await chooseMode('full');await goTab(page,'列表');await page.locator('.timetable .course-card').first().waitFor();
  await settled();
  await page.screenshot({path:`build/evidence/${version}-liquid-full-home-light.png`});
  await goTab(page,'搜索');assert.equal(await page.locator('.search-results .result-card').first().evaluate(el=>getComputedStyle(el).backdropFilter),'none');assert.match(await page.locator('.search-results').evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);
  await goTab(page,'设置');assert.match(await page.locator('.screen.active md-card').first().evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);
  await settled();await page.screenshot({path:`build/evidence/${version}-liquid-full-settings-light.png`});await page.locator('[data-setting="appearance"]').click();assert.match(await active().locator('.sub-header').evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);
  pass('完全模式覆盖主页卡片、搜索、设置与页头，列表内层不重复叠加模糊');

  for(const mode of ['light','dark']){
    await seed({glass:true,glassMode:'full',mode});await goTab(page,'列表');
    await page.getByRole('button',{name:'选择日期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'选择日期',exact:true});assert.match(await dialog.evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);
    const samples=await contrastSamples();
    assert.equal(samples.samples.length,3,'必须检查日期表面、课程文字和真实次要按钮');
    for(const sample of samples.samples){const ratios=[0,255].map(value=>contrast(sample.text,alphaBlend(sample.background,alphaBlend(samples.veil,[value,value,value]))));const minimum=Math.min(...ratios);assert.ok(minimum>=4.5,`${mode} ${sample.selector}: 文本对比度 ${minimum}`);contrastResults.push({mode,selector:sample.selector,minimumContrast:minimum});}
    assert.ok(await dialog.isVisible());await settled();assert.equal(await dialog.evaluate(el=>getComputedStyle(el).opacity),'1');await page.screenshot({path:`build/evidence/${version}-liquid-full-calendar-${mode}.png`});await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  }
  pass('深浅完全模式下文字、课程说明和次要按钮对比度至少 4.5:1，月历弹窗清晰');

  await seed({glass:true,glassMode:'partial',mode:'light'});await page.locator('.dock[data-droplet-ready=true]').waitFor();
  await page.evaluate(()=>{const pattern=document.createElement('div');pattern.id='liquid-grid';Object.assign(pattern.style,{position:'absolute',inset:'auto 0 0',height:'120px',zIndex:'19',background:'repeating-linear-gradient(90deg,#f43b20 0 5px,#2655df 5px 10px,#fff 10px 15px)'});document.querySelector('.app-shell').append(pattern);});
  const dock=page.locator('.dock'),bounds=await dock.boundingBox(),label=dock.locator('.dock-content').first(),idle=await label.boundingBox(),sampling=await page.locator('.dock-droplet').boundingBox();
  await page.mouse.move(bounds.x+bounds.width/6,bounds.y+bounds.height/2);await page.mouse.down();await page.waitForTimeout(260);const pressed=await label.boundingBox();assert.ok(pressed.width>=idle.width*1.2&&pressed.height>=idle.height*1.2);assert.ok(Math.abs((await page.locator('.dock-droplet').boundingBox()).width-sampling.width)<1);
  for(const fraction of [.28,.53,.76]){
    await page.mouse.move(bounds.x+bounds.width*fraction,bounds.y+bounds.height/2,{steps:10});await page.waitForTimeout(700);
    const position=await page.locator('.dock-droplet').boundingBox();assert.ok(position.x>=bounds.x-1&&position.x+position.width<=bounds.x+bounds.width+1);const pixels=await capsuleSpill();assert.equal(pixels.outside,0);assert.ok(pixels.inside>100);capsuleResults.push({fraction,...pixels});
  }
  assert.equal(await dock.getAttribute('data-dragging'),'true');assert.equal(await dock.getAttribute('data-preview'),'2');assert.equal(await page.locator('.dock-tether').count(),0);
  const shadows=await page.locator('.dock-droplet-rim').evaluate(el=>getComputedStyle(el).boxShadow);assert.ok(shadows.split(/,(?![^()]*\))/).every(value=>value.includes('inset')),'胶囊不能留下外侧投影');
  await page.mouse.up();await page.waitForTimeout(600);assert.equal(await active().getAttribute('data-screen'),'settings');assert.equal(await dock.getAttribute('data-dragging'),'false');
  await page.locator('.dock-droplet-window').evaluate(el=>el.style.maskImage='none');const mutation=await capsuleSpill();assert.ok(mutation.outside>80);await page.locator('.dock-droplet-window').evaluate(el=>el.style.removeProperty('mask-image'));await page.evaluate(()=>document.getElementById('liquid-grid').remove());
  pass('按压放大至少 1.2 倍、采样不缩放，三段拖动透镜像素均无矩形泄漏或外投影');

  await goTab(page,'列表');await page.waitForTimeout(600);
  const before=await page.locator('.dock-droplet').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);await goTab(page,'设置');
  await page.waitForTimeout(50);const during=await page.locator('.dock-droplet').evaluate(el=>({x:new DOMMatrix(getComputedStyle(el).transform).m41,press:Number(el.style.getPropertyValue('--drop-press'))}));await page.waitForTimeout(650);const after=await page.locator('.dock-droplet').evaluate(el=>({x:new DOMMatrix(getComputedStyle(el).transform).m41,press:Number(el.style.getPropertyValue('--drop-press'))}));
  assert.ok(during.x>before&&during.x<after.x-5);assert.ok(during.press>0);assert.ok(after.press<.01);
  pass('跨标签点击实际弹性移动，途中保留放大透镜，接近目标后再收起');

  await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByLabel('学期名称',{exact:true}).fill('尚未保存的学期');
  await goTab(page,'列表');await page.getByRole('dialog',{name:'有尚未保存的内容',exact:true}).waitFor();await page.waitForTimeout(650);
  assert.equal(await dock.getAttribute('data-preview'),'2');assert.equal(await active().getAttribute('data-screen'),'editor');
  await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByLabel('学期名称',{exact:true}).inputValue(),'尚未保存的学期');
  assert.equal(await dock.getAttribute('data-preview'),'2');await goTab(page,'列表');await page.getByRole('button',{name:'放弃修改并离开',exact:true}).click();await active().locator('.home-inner').waitFor();await page.waitForTimeout(650);
  assert.equal(await dock.getAttribute('data-preview'),'0');
  pass('草稿保护拦截底栏切换时胶囊回到当前页，继续编辑与确认离开保持一致');

  await seed({glass:true,glassMode:'full',mode:'dark',scale:1.1});await page.setViewportSize({width:330,height:640});await goTab(page,'搜索');
  const dockBefore=await dock.boundingBox();await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill('课程');await page.evaluate(()=>window.dolphinInsets(28,24,270,640));const dockWithInsets=await dock.boundingBox();await page.evaluate(()=>window.dolphinInsets(28,24,0,640));const baseline=await dock.boundingBox();
  assert.ok(Math.abs(dockWithInsets.y-baseline.y)<.1);assert.ok(dockBefore.height===dockWithInsets.height);
  await page.evaluate(()=>window.dolphinInsets(28,24,270,640));await page.setViewportSize({width:330,height:370});assert.ok(Math.abs((await dock.boundingBox()).y-baseline.y)<.1);await page.setViewportSize({width:330,height:640});await page.evaluate(()=>window.dolphinInsets(0,0,0,640));
  const overflow=await active().evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(overflow<=1);
  await page.emulateMedia({reducedMotion:'reduce'});await goTab(page,'设置');await page.waitForTimeout(80);assert.equal(await dock.getAttribute('data-preview'),'2');assert.equal(await page.locator('.dock-content').last().evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),1);
  await page.screenshot({path:`build/evidence/${version}-liquid-full-dark-narrow.png`});
  pass('完全模式在 330×640、110% 比例、键盘缩窗与减少动态效果下布局和选择正确');

  await page.locator('html').evaluate(el=>el.dataset.performance='reduced');assert.equal(await active().locator('md-card').first().evaluate(el=>getComputedStyle(el).backdropFilter),'none');assert.doesNotMatch(await page.locator('.dock-droplet-window').evaluate(el=>getComputedStyle(el).backdropFilter),/glass-droplet/);
  await goTab(page,'列表');await page.waitForTimeout(50);assert.equal(await active().getAttribute('data-screen'),'list');
  pass('性能降级去除全界面模糊及昂贵位移，课程与标签选择继续正常');

  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});await seed({glass:true,glassMode:'full',performance:'auto'});
  await page.clock.install({time:new Date(2026,8,29,9)});await page.clock.pauseAt(new Date(2026,8,29,9,0,1));await page.mouse.move(100,100);await page.mouse.down();
  await page.clock.runFor(1000);await page.mouse.up();assert.equal(await page.locator('html').getAttribute('data-performance'),'reduced');
  pass('自动模式在受控的 60 Hz 帧时序下实际降低质量，交互采样不是无效开关');
  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-liquid-modes-results.json`,JSON.stringify({version,checks,errors,contrast:contrastResults,capsule:capsuleResults,unclippedMutation:mutation},null,2));
}finally{await browser.close();}
