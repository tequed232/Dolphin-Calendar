import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const URL=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
await mkdir('build/evidence',{recursive:true});
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function storedData(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const value=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return value;});}
async function savedGlassMode(mode){
 await page.evaluate(async mode=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const value=await new Promise((resolve,reject)=>{const r=store.get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});value.settings.glassMode=mode;value.settings.glass=mode!=='off';store.put(value,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},mode);
 const saved=await storedData();await page.reload();await page.locator('.load-note').waitFor({state:'hidden'});await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();return saved;
}
async function backdropPixels(){const png=(await page.screenshot()).toString('base64');return page.evaluate(async png=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=8;canvas.height=580;const context=canvas.getContext('2d');context.drawImage(image,4,80,8,580,0,0,8,580);return Array.from(context.getImageData(0,0,8,580).data);},png);}
try{
 await page.clock.setFixedTime(new Date(2026,8,29,9,0));
 await page.goto(URL);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await check('冷启动首页、常驻底栏、关闭引导不重开',async()=>{await page.waitForTimeout(350);assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.primary-navigation').count(),1);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'list');});
 await check('二级导入任务隐藏Dock，键盘只缩短可编辑视口并恢复',async()=>{
  await page.evaluate(()=>window.dolphinInsets(28,24,0,844));await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();assert.equal(await page.locator('.primary-navigation').count(),0);await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).focus();await page.evaluate(()=>window.dolphinInsets(28,24,320,844));await page.waitForTimeout(400);const input=await page.getByRole('textbox',{name:'课表内容',exact:true}).boundingBox();assert.ok(input.y<524&&input.y+input.height<=525);assert.equal(await page.locator('.screen-host').evaluate(el=>el.getBoundingClientRect().height),524);await page.setViewportSize({width:390,height:524});assert.equal(await page.locator('.primary-navigation').count(),0);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.activeElement.blur();window.dolphinInsets(28,24,0,844);});await goTab(page,'列表');await page.evaluate(()=>{window.dolphinInsets(0,0);document.documentElement.style.removeProperty('--native-height');});assert.equal(await page.locator('.primary-navigation').count(),1);
 });
 await check('日期条持续双向滚动并点选，背景固定在视口',async()=>{
  const first=await page.locator('.date-item').first().getAttribute('aria-label');
  const backdrop=await page.locator('.app-background').evaluate(el=>getComputedStyle(el).position);
  assert.equal(backdrop,'absolute');
  for(let i=0;i<4;i++){await page.locator('.date-strip').evaluate(el=>{el.scrollLeft=el.scrollWidth;});await page.waitForTimeout(350);}
  assert.notEqual(await page.locator('.date-item').first().getAttribute('aria-label'),first);
  const farRight=await page.locator('.date-item').first().getAttribute('aria-label');
  const picked=await page.locator('.date-strip').evaluate(el=>{const r=el.getBoundingClientRect(),center=r.x+r.width/2;const item=Array.from(el.querySelectorAll('button')).filter(button=>{const b=button.getBoundingClientRect();return b.x>=r.x&&b.right<=r.right;}).sort((a,b)=>Math.abs(a.getBoundingClientRect().x+a.clientWidth/2-center)-Math.abs(b.getBoundingClientRect().x+b.clientWidth/2-center))[0];item?.click();return item?.getAttribute('aria-label');});
  assert.ok(picked);assert.equal(await page.locator('.date-item.selected').getAttribute('aria-label'),picked);
  for(let i=0;i<4;i++){await page.locator('.date-strip').evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(350);}
  assert.notEqual(await page.locator('.date-item').first().getAttribute('aria-label'),farRight);
  await page.getByRole('button',{name:'回到今天',exact:true}).click();
 });
 await check('新版材质主题与旧数据的外观迁移',async()=>{
  const palette=await page.evaluate(()=>({canvas:getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),ink:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}));
  assert.deepEqual(palette,{canvas:'#f5f6f7',ink:'#182c2d',accent:'#007f89'});
  await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const value=await new Promise((resolve,reject)=>{const r=store.get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});delete value.appearanceRevision;value.settings.dynamicColor=true;store.put(value,'app');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.dynamic==='false');
  assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'list');
 });
 await check('实体导航不包含玻璃透镜、拖动层，四项标签直接切页',async()=>{
  assert.equal(await page.locator('.dock,#glass-droplet').count(),0);
  assert.deepEqual(await page.locator('.primary-navigation>button').allTextContents(),['列表','平铺','搜索','设置']);
  const bounds=await page.locator('.primary-navigation').boundingBox(),host=await page.locator('.screen-host').boundingBox();assert.ok(host.y+host.height<=bounds.y+1);
  for(const [name,route] of [['设置','settings'],['搜索','search'],['平铺','grid'],['列表','list']]){await goTab(page,name);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),route);assert.equal(await page.locator('.primary-navigation [aria-current=page]').innerText(),name);}
 });
 await goTab(page,'设置');
 await check('设置分组与入口顺序',async()=>{assert.deepEqual(await page.locator('.screen.active .setting-entry strong').allTextContents(),['主页显示','课表管理','外观','实时通知','导航与学校','应用更新','数据与备份','关于']);assert.equal(await page.locator('.screen.active [data-setting=editor]').count(),1);});
 await check('通知三段流程与导航状态开关持久化',async()=>{
  await page.locator('[data-setting="notifications"]').click();
  assert.deepEqual(await page.locator('.screen.active .subheading').allTextContents(),['课前提醒','导航中的实时状态','通知栏小伙伴']);
  assert.equal(await page.locator('#notifications-enabled').isChecked(),true);
  assert.equal(await page.locator('.lyrics-disclosure').getAttribute('aria-expanded'),'false');
  await page.locator('.lyrics-disclosure').click();assert.equal(await page.locator('.lyric-row').count(),2);
  await page.getByRole('button',{name:'添加一句台词'}).click();assert.equal(await page.locator('.lyric-row').count(),3);
  await page.locator('.lyric-row input').last().fill('上课啦');
  await page.locator('.lyrics-disclosure').click();assert.equal(await page.locator('.lyric-row').count(),0);
  assert.equal(await page.locator('#journey-live').isChecked(),true);
  await page.locator('#journey-live').click();await page.waitForFunction(()=>!document.querySelector('#journey-live').checked);
  await page.reload();await goTab(page,'设置');await page.locator('[data-setting="notifications"]').click();
  assert.equal(await page.locator('#journey-live').isChecked(),false);
  await page.locator('#journey-live').click();await page.waitForFunction(()=>document.querySelector('#journey-live').checked);
  await page.reload();await goTab(page,'设置');
 });
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();
 await check('文件入口优先、JSON粘贴作为折叠备选',async()=>{
  await pasteJSON(page);const paste=await page.locator('.screen.active textarea[aria-label="课表内容"]').boundingBox();
  const file=await page.locator('.screen.active .import-file-button').boundingBox();
  assert.ok(paste&&file&&file.y<paste.y,'文件入口应先于粘贴内容');
  assert.ok(file.width<190,'文件入口应收成小按钮');
  await page.waitForTimeout(350);await page.screenshot({path:'build/evidence/import-redesign.png'});
 });
 await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'知道了',exact:true}).click();
 const schedule={term:{name:'验证学期',startDate:'2026-09-28',weeks:20},courses:[{name:'数据结构',teacher:'陈老师',room:'16-203/202',day:2,start:3,end:4,weeks:[1,2,3,4],color:'sage'},{name:'未来课程',teacher:'李老师',room:'图书楼 A302',day:2,start:5,end:6,weeks:[16,17,18,19,20],color:'blue'}]};
 await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(schedule));await page.getByRole('button',{name:'解析并预览',exact:true}).click();
 assert.equal(await page.getByPlaceholder('例如：某某大学某某校区').count(),0);
 await page.getByRole('button',{name:'确认导入',exact:true}).click();await goTab(page,'列表');
 await check('JSON 导入规范楼栋与 IndexedDB 刷新持久化',async()=>{await page.locator('.screen.active .course-card').first().waitFor();assert.match(await page.locator('.screen.active .course-card').first().innerText(),/数据结构/);assert.match(await page.locator('.screen.active .course-card').first().innerText(),/16栋203号教室/);await page.reload();await page.locator('.screen.active .course-card').first().waitFor();assert.match(await page.locator('.screen.active').innerText(),/验证学期/);});
 await check('整学年课程在主页可见且标明实际周次',async()=>{assert.equal(await page.locator('.screen.active .course-card').count(),2);await page.locator('.other-week-disclosure summary').click();assert.match(await page.locator('.screen.active .course-card.other-week').innerText(),/未来课程/);assert.match(await page.locator('.screen.active .course-card.other-week').innerText(),/第 16-20 周/);assert.match(await page.locator('.screen.active .day-heading [role=status]').getAttribute('aria-label'),/，1 门课程$/);});
 await check('主页快捷按钮固定在滚动层外',async()=>{
  const nav=page.locator('.nav-fab');await page.waitForTimeout(400);const before=await nav.boundingBox();assert.ok(before);
  const backgroundBefore=await backdropPixels();
  await page.locator('.screen.active').evaluate(el=>{el.scrollTop=700;});await page.waitForTimeout(100);
  const after=await nav.boundingBox();assert.ok(after);assert.ok(Math.abs(after.y-before.y)<1);
  assert.deepEqual(await backdropPixels(),backgroundBefore,'滚动后视口边缘的背景像素应保持原位');
  const host=await nav.evaluate(el=>el.parentElement?.parentElement?.parentElement?.id);assert.equal(host,'home-actions-portal');
  for(const button of [page.getByRole('button',{name:'导航课程',exact:true})]){
   assert.equal(await button.innerText(),'');const bounds=await button.boundingBox();assert.equal(Math.round(bounds.width),52);assert.equal(Math.round(bounds.height),52);assert.equal(await button.locator('svg').count(),1);
  }
  assert.equal(await page.locator('.today-fab').count(),0);assert.equal(await page.getByRole('button',{name:'回到今天',exact:true}).count(),1);assert.equal(await nav.locator('[data-icon]').getAttribute('data-icon'),'navigate');
  await page.locator('.screen.active').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:`build/evidence/${version}-home-actions.png`});
 });
 await check('学校未填写时引导到导航设置',async()=>{
  await page.locator('.screen.active .course-card').first().click();await page.getByRole('button',{name:'导航至16栋'}).click();
  assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'navigation');
 });
 await check('地图只搜索学校和楼栋，教室号留在课程中',async()=>{
  await goTab(page,'设置');await page.locator('[data-setting="navigation"]').click();
  await page.getByPlaceholder('例如：浙江大学紫金港校区').fill('验证大学');
  await goTab(page,'列表');await page.locator('.screen.active .course-card').first().click();
  await page.evaluate(()=>{window.open=(url)=>{window.__mapUrl=String(url);return null;};});
  await page.getByRole('button',{name:'导航至16栋'}).click();
  const url=await page.evaluate(()=>decodeURIComponent(window.__mapUrl??''));
  assert.match(url,/验证大学 16栋/);assert.doesNotMatch(url,/203号教室/);
  await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();
 });
 await page.locator('.screen.active .course-card').first().click();await page.locator('.course-sheet').waitFor();
 await check('封面文件真实导入与保存',async()=>{
   await page.evaluate(()=>{window.__bridgeMessages=[];window.Dolphin={postMessage(raw){window.__bridgeMessages.push(JSON.parse(raw));}};});
   const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=','base64');
   await page.locator('input[aria-label="从相册选图"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:pixel});
   await page.locator('dialog[open] .cover-preview').waitFor();assert.equal(await page.locator('dialog[open] .cover-preview').evaluate(img=>img.naturalWidth>0),true);
   await page.getByRole('button',{name:'保存并标记',exact:true}).click();await page.locator('.book-card img').waitFor();assert.equal(await page.locator('.book-actions').count(),0);
   await page.waitForFunction(()=>window.__bridgeMessages?.some(message=>message.type==='bookCovers'&&message.covers['数据结构']?.startsWith('data:image/jpeg;base64,')));
   await page.evaluate(()=>{delete window.Dolphin;delete window.__bridgeMessages;});
 });
 await check('对话框用户关闭后不自行重开、可以再次打开',async()=>{await page.getByRole('button',{name:'编辑教材',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForTimeout(500);assert.equal(await page.locator('dialog[open]').count(),0);await page.getByRole('button',{name:'编辑教材',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),1);await page.getByRole('button',{name:'取消',exact:true}).click();});
 await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();
 await page.screenshot({path:'build/evidence/home-390.png'});
 await check('搜索匹配高亮与直达详情',async()=>{await goTab(page,'搜索');await page.getByRole('searchbox',{name:'搜索课程',exact:true}).fill('陈老师');assert.equal(await page.locator('.screen.active mark').innerText(),'陈老师');await page.locator('.screen.active .result-card').click();assert.match(await page.locator('.course-sheet h1').innerText(),/数据结构/);await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();});
 await check('标签切换不闪过主页，底栏只有一份',async()=>{await goTab(page,'设置');assert.equal(await page.locator('[data-screen=list]').evaluate(e=>getComputedStyle(e).visibility),'hidden');await goTab(page,'搜索');assert.equal(await page.locator('[data-screen=list]').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.equal(await page.locator('.primary-navigation').count(),1);});
 await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();
 await check('圆角选择菜单与系统深浅模式实时切换',async()=>{
  const trigger=page.getByRole('button',{name:'深浅模式',exact:true});
  assert.equal(await trigger.evaluate(element=>getComputedStyle(element).borderRadius),'15px');
  await trigger.click();assert.equal(await page.getByRole('listbox',{name:'深浅模式'}).isVisible(),true);
  await page.getByRole('option',{name:'深色 · 夜航'}).click();await page.waitForFunction(()=>document.documentElement.dataset.mode==='dark');
  await trigger.click();await page.getByRole('option',{name:'跟随系统'}).click();
  await page.evaluate(()=>{window.dolphinSystemDark=true;window.dispatchEvent(new Event('dolphin-system-theme'));});
  await page.waitForFunction(()=>document.documentElement.dataset.mode==='dark');
  await page.evaluate(()=>{window.dolphinSystemDark=false;window.dispatchEvent(new Event('dolphin-system-theme'));});
  await page.waitForFunction(()=>document.documentElement.dataset.mode==='light');
  await page.screenshot({path:'build/evidence/appearance-custom-controls.png'});
 });
 await check('旧玻璃偏好保留数据，实体导航不受透镜模式影响',async()=>{
  assert.equal(await page.locator('.primary-navigation').count(),0);assert.equal(await page.getByRole('button',{name:'液态玻璃模式',exact:true}).count(),0);
  for(const mode of ['full','off','partial']){const saved=await savedGlassMode(mode);assert.deepEqual(await storedData(),saved);await goTab(page,'列表');assert.equal(await page.locator('.primary-navigation').count(),1);assert.equal(await page.locator('.dock,#glass-droplet').count(),0);}
  await goTab(page,'设置');await page.locator('[data-setting="appearance"]').click();
 });
 await check('不同触发高度与右边缘的返回收拢位置',async()=>{
  await page.waitForTimeout(350);
  for(const [x,y] of [[0,.2],[0,.8],[1,.6]]){
   const actual=await page.evaluate(({x,y})=>{window.dolphinBack('start',0,x,y);window.dolphinBack('progress',.6);return document.querySelector('.screen.active').style.transformOrigin;},{x,y});
   const [ox,oy]=actual.split(' ').map(parseFloat);assert.ok(Math.abs(ox-x*390)<1);assert.ok(Math.abs(oy-y*844)<1);
   await page.evaluate(()=>window.dolphinBack('cancel'));await page.waitForTimeout(250);
   assert.equal(await page.locator('.screen.active').evaluate(e=>e.style.transformOrigin),'');
  }
 });
 await check('同步返回进度、降级玻璃、取消与提交只退一层',async()=>{
  await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('progress',.6);});
  assert.equal(await page.locator('html').evaluate(e=>e.style.getPropertyValue('--back-progress')),'0.6');assert.equal(await page.locator('.primary-navigation').count(),0);
  await page.evaluate(()=>window.dolphinBack('cancel'));await page.waitForTimeout(250);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'appearance');
  await page.evaluate(()=>{window.dolphinBack('start');window.dolphinBack('progress',1);window.dolphinBack('commit');});await page.waitForTimeout(250);assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'settings');assert.equal(await page.locator('.sub-screen').count(),0);assert.equal(await page.locator('.primary-navigation').count(),1);
 });
 await check('文本入口保留 JSON 校验，文件入口支持 JSON/CSV/Excel',async()=>{
   await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.locator('.screen.active .import-entry').click();
   const html='<table><tr><th>课程名</th></tr><tr><td>线性代数</td></tr></table><script>window.injected=true</script>';
   await pasteJSON(page);await page.getByRole('textbox',{name:'课表内容'}).fill(html);await page.getByRole('button',{name:'解析并预览',exact:true}).click();
   assert.match(await page.getByRole('alert').innerText(),/有效的 JSON/);await page.getByRole('button',{name:'知道了'}).click();
   await page.locator('.screen.active input[type=file]').setInputFiles({name:'schedule.html',mimeType:'text/html',buffer:Buffer.from(html)});
   assert.match(await page.getByRole('alert').innerText(),/无法自动识别.*支持 JSON/s);await page.getByRole('dialog',{name:'读取课表'}).getByRole('button',{name:'取消',exact:true}).click();
   const json=JSON.stringify({courses:[{name:'线性代数',day:2,start:1,end:2,weeks:[1,2],room:'3-402/202'}]});
   await page.locator('.screen.active input[type=file]').setInputFiles({name:'schedule.json',mimeType:'application/json',buffer:Buffer.from(json)});
   await page.getByRole('button',{name:'确认导入',exact:true}).click();await goTab(page,'列表');await page.locator('[data-screen=list].active').waitFor();if(await page.locator('.screen.active .other-week-disclosure summary').count())await page.locator('.screen.active .other-week-disclosure summary').click();await page.locator('.screen.active .course-card').waitFor();
   assert.match(await page.locator('.screen.active .course-card').first().innerText(),/3栋402号教室/);assert.equal(await page.evaluate(()=>window.injected),undefined);
 });
 await check('系统日历导入结果、创建说明与复原操作',async()=>{
   await page.evaluate(()=>{window.__calendarBridge=window.Dolphin;window.__calendarCommands=[];window.Dolphin={postMessage:raw=>window.__calendarCommands.push(JSON.parse(raw))};});
   await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:/导入到系统日历/}).click();
   await page.evaluate(()=>window.dolphinNative({type:'calendarResult',action:'calendarStatus',success:true,permission:true,count:3,canRestore:true,busy:false}));
   assert.match(await page.locator('.calendar-summary').innerText(),/由 Dolphin Calendar 创建/);
   await page.getByRole('button',{name:'导入到系统日历',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'正在处理…'}).isDisabled(),true);
   const command=await page.evaluate(()=>window.__calendarCommands.find(command=>command.type==='calendarSync'));assert.ok(command.schedule.courses.length);assert.match(command.schedule.courses[0].room,/号教室/);
   await page.evaluate(()=>window.dolphinNative({type:'calendarResult',action:'calendarSync',success:true,message:'已导入 2 次上课到系统日历',permission:true,count:2,canRestore:true}));
   assert.match(await page.locator('.calendar-result').innerText(),/已导入 2/);
   await page.getByRole('button',{name:'复原到导入前',exact:true}).click();await page.getByRole('button',{name:'确认复原',exact:true}).click();
   assert.ok(await page.evaluate(()=>window.__calendarCommands.some(command=>command.type==='calendarRestore')));
   await page.evaluate(()=>window.dolphinNative({type:'calendarResult',action:'calendarRestore',success:true,message:'已复原到导入前',permission:true,count:3,canRestore:false}));
   assert.equal(await page.getByRole('button',{name:'复原到导入前',exact:true}).isDisabled(),true);
   await page.screenshot({path:`build/evidence/${version}-calendar-browser.png`});
   await goTab(page,'列表');await page.evaluate(()=>{if(window.__calendarBridge)window.Dolphin=window.__calendarBridge;else delete window.Dolphin;});
 });
 await check('窄屏与横屏布局、教材按钮换行不越界',async()=>{
   for(const [width,height] of [[308,720],[360,900],[390,844],[740,360]]){
    await page.setViewportSize({width,height});await page.locator('.screen.active .course-card').click();await page.waitForTimeout(350);
    const invalid=await page.locator('.book-actions>*').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect()).filter(r=>r.left<0||r.right>innerWidth+1).length);assert.equal(invalid,0,`${width}x${height}教材按钮`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`build/evidence/detail-${width}x${height}.png`});await page.getByRole('button',{name:'关闭课程详情',exact:true}).click();
   }
 });
 assert.deepEqual(errors,[]);console.log(`全部 ${results.length} 项浏览器守卫通过`);
 await writeFile('build/evidence/ui-results.json',JSON.stringify({version,at:new Date().toISOString(),url:URL,results,errors},null,2));
}finally{await browser.close();}
