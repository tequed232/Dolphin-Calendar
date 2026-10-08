import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.addInitScript(()=>{
    window.updateCommands=[];
    window.mockUpdate={installed:'1.4.3',available:true,busy:false,checkedAt:Date.now(),message:'发现新版本 v9.0.0',release:{version:'v9.0.0',url:'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v9.0.0',notes:'新版本说明\n示例第二行',assetUrl:'https://github.com/tequed232/Dolphin-Calendar/releases/download/v9.0.0/Dolphin-Calendar.apk',assetName:'Dolphin-Calendar.apk',assetSize:2000000}};
    const send=()=>window.dolphinNative?.({type:'updateStatus',update:structuredClone(window.mockUpdate)});
    window.Dolphin={postMessage(raw){const message=JSON.parse(raw);window.updateCommands.push(message);
      if(message.type==='ready'||message.type==='updateStatus')queueMicrotask(send);
      if(message.type==='checkUpdate'){window.mockUpdate.busy=true;send();setTimeout(()=>{window.mockUpdate.busy=false;send();},100);}
      if(message.type==='downloadUpdate'){window.mockUpdate.download='running';window.mockUpdate.downloaded=1000000;window.mockUpdate.total=2000000;send();}
    }};
  });
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');
  await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
  const indicator=page.getByRole('button',{name:'有新版本，前往更新页面',exact:true});await indicator.waitFor();
  assert.equal(await indicator.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 216, 91)');
  await indicator.click();await page.locator('[data-screen="updates"].active').waitFor();
  assert.equal(await page.locator('#auto-update').isChecked(),true);assert.equal(await page.locator('#direct-download').isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'下载安装包',exact:true}).count(),0);
  await page.getByRole('button',{name:'立即检查更新',exact:true}).click();await page.getByRole('button',{name:'立即检查更新',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.updateCommands.filter(c=>c.type==='checkUpdate').length),1);
  await page.locator('#direct-download').click();await page.waitForFunction(()=>document.querySelector('#direct-download')?.checked===true);await page.getByRole('button',{name:'下载安装包',exact:true}).click();await page.getByText('正在下载 · 50%',{exact:true}).waitFor();
  await page.evaluate(()=>{window.mockUpdate.download='complete';window.dolphinNative({type:'updateStatus',update:structuredClone(window.mockUpdate)});});
  await page.getByRole('button',{name:'下载完成 · 打开下载列表',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.updateCommands.some(c=>c.type==='updateDownloads')),true);
  await page.getByRole('button',{name:'前往 GitHub Release',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.updateCommands.find(c=>c.type==='openExternal').url),'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v9.0.0');
  await page.locator('#auto-update').click();await page.waitForFunction(()=>document.querySelector('#auto-update')?.checked===false);
  // Saving preferences completes asynchronously. Read the actual database before reloading.
  for(let attempt=0;attempt<50;attempt++){
    const saved=await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('dolphin-calendar');request.onsuccess=()=>{const db=request.result,r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>{resolve(r.result?.settings);db.close();};};}));
    if(saved?.autoUpdate===false&&saved?.directDownload===true)break;
    if(attempt===49)throw new Error('更新偏好未保存');await page.waitForTimeout(50);
  }
  await page.reload();await goTab(page,'设置');await page.locator('[data-setting="about"]').click();await page.getByRole('button',{name:'应用更新',exact:false}).click();
  assert.equal(await page.locator('#auto-update').isChecked(),false);assert.equal(await page.locator('#direct-download').isChecked(),true);
  await page.setViewportSize({width:320,height:800});assert.equal(await page.locator('[data-screen="updates"].active').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.evaluate(()=>{window.mockUpdate.available=false;window.mockUpdate.release=null;window.mockUpdate.message='GitHub 尚未发布正式版本';window.dolphinNative({type:'updateStatus',update:structuredClone(window.mockUpdate)});});
  await goTab(page,'列表');assert.equal(await page.locator('.update-indicator').count(),0);
  assert.deepEqual(errors,[]);await mkdir('build/evidence',{recursive:true});await page.screenshot({path:'build/evidence/1.4.3-update-home.png'});
  console.log('PASS 更新徽标与路由 / 手动检查 / 独立下载开关与进度 / 无更新状态 / 偏好保存 / 窄屏（原生桥模拟）');
}finally{await browser.close();}
