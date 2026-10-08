import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:320,height:640},deviceScaleFactor:1});
const checks=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
await mkdir('build/evidence',{recursive:true});
try{
  await page.clock.setFixedTime(new Date(2026,9,2,9));
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar',1);request.onsuccess=()=>resolve(request.result);});const data=await new Promise(resolve=>{const request=db.transaction('state').objectStore('state').get('app');request.onsuccess=()=>resolve(request.result);});data.schedule.term={name:'构图验证学期',startDate:'2026-09-28',weeks:20};data.schedule.courses=[{id:'layout-course',name:'财政学原理与公共政策',teacher:'陈老师',room:'16栋203号教室',day:5,start:3,end:4,weeks:[1],color:'sage',notes:''}];const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');await new Promise(resolve=>tx.oncomplete=resolve);db.close();});
  await page.reload();await page.locator('.next-course').waitFor();await page.waitForTimeout(400);
  const course=await page.locator('.next-course').boundingBox(),action=await page.locator('.nav-fab').boundingBox();
  assert.ok(course.y+course.height<=action.y-3,'短屏首张课程卡不应被固定按钮遮挡');pass('320×640 首张课程卡的标题、时间与教室不被快捷按钮遮挡');
  await page.screenshot({path:`build/evidence/${version}-compact-home.png`});
  await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();await page.waitForTimeout(350);
  const file=await page.locator('.screen.active .import-file-button').boundingBox();assert.equal(await page.locator('.dock').count(),0);assert.ok(file.y+file.height<640-18);pass('短屏导入文件主操作完整可见，二级任务不显示底栏');
  await page.screenshot({path:`build/evidence/${version}-compact-import.png`});
  await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();await page.getByRole('button',{name:/^背景(?:\s|$)/}).click();await page.waitForTimeout(350);
  const pick=await page.locator('.background-card .file-button').boundingBox();assert.equal(await page.locator('.dock').count(),0);assert.ok(pick.y+pick.height<640-18);pass('短屏背景选图按钮完整显示，二级任务不显示底栏');
  await page.getByLabel('选择背景图片',{exact:true}).setInputFiles({name:'布局背景.png',mimeType:'image/png',buffer:await readFile('web/src/assets/brand/app-icon.png')});await page.locator('.preview-photo').waitFor();await page.waitForTimeout(4500);
  const preview=page.locator('.background-preview'),photo=page.locator('.preview-photo');
  async function corners(){const visible=await preview.screenshot();await photo.evaluate(e=>e.style.visibility='hidden');const hidden=await preview.screenshot();await photo.evaluate(e=>e.style.removeProperty('visibility'));return page.evaluate(async images=>{const values=await Promise.all(images.map(async source=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,pixels:ctx.getImageData(0,0,image.width,image.height).data};}));const [a,b]=values;let outside=0,inside=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const index=(y*a.width+x)*4,change=Math.abs(a.pixels[index]-b.pixels[index])+Math.abs(a.pixels[index+1]-b.pixels[index+1])+Math.abs(a.pixels[index+2]-b.pixels[index+2]);if(change<12)continue;const cornerX=x<25?25:x>a.width-25?a.width-25:x,cornerY=y<25?25:y>a.height-25?a.height-25:y;if(Math.hypot(x+.5-cornerX,y+.5-cornerY)>26)outside++;else inside++;}return {outside,inside};},[visible,hidden].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));}
  const clipped=await corners();assert.equal(clipped.outside,0);assert.ok(clipped.inside>100);pass('背景预览的图片与模糊仅在圆角内显示，四角无透明方形');
  await preview.evaluate(e=>{e.style.clipPath='none';e.style.overflow='visible';});const broken=await corners();assert.ok(broken.outside>30,'像素检查必须能发现未裁切的图片层');await preview.evaluate(e=>{e.style.removeProperty('clip-path');e.style.removeProperty('overflow');});pass('取消圆角裁切的变异会被像素检查拒绝');
  await page.screenshot({path:`build/evidence/${version}-compact-background.png`});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:`build/evidence/${version}-background-preview.png`});
  assert.deepEqual(errors,[]);await writeFile(`build/evidence/${version}-layout-results.json`,JSON.stringify({version,checks,errors,clipped,unclippedMutation:broken},null,2));
}finally{await browser.close();}
