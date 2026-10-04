import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {_android} from 'playwright';

const serial=process.env.ANDROID_SERIAL;
assert.match(serial??'',/^emulator-\d+$/,'此检查只操作明确指定的模拟器，不操作手机');
const app='com.dolphin.calendar.debug';
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:20000});
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const prefix=process.env.DEVICE_EVIDENCE_PREFIX??`${version}-android`;
const device=(await _android.devices()).find(d=>d.serial()===serial);
assert.ok(device,'指定设备未连接');
const report={version,device:adb('shell','getprop','ro.product.model').trim(),sdk:adb('shell','getprop','ro.build.version.sdk').trim(),checks:[],measurements:[]};
let page;
await mkdir('build/evidence',{recursive:true});
try{
  page=await(await device.webView({pkg:app})).page();
  const intro=page.getByRole('button',{name:'先逛一逛',exact:true});if(await intro.isVisible())await intro.click();
  const measure=()=>page.evaluate(()=>{
    const rect=el=>el?.getBoundingClientRect().toJSON();
    const css=getComputedStyle(document.documentElement);
    return {dock:rect(document.querySelector('.dock')),host:rect(document.querySelector('.screen-host')),input:rect(document.activeElement),dialog:rect(document.querySelector('dialog[open]')),keyboard:parseFloat(css.getPropertyValue('--keyboard-height')),bottom:css.getPropertyValue('--native-bottom'),height:parseFloat(css.getPropertyValue('--native-height')),visual:visualViewport.height,offset:visualViewport.offsetTop,dpr:devicePixelRatio};
  });
  async function keyboardCase(label,input,screenshot){
    await input.scrollIntoViewIfNeeded();await page.waitForTimeout(350);
    const before=await measure(),box=await input.boundingBox();
    adb('shell','input','tap',String(Math.round((box.x+box.width/2)*before.dpr)),String(Math.round((box.y+Math.min(20,box.height/2))*before.dpr)));
    await page.waitForFunction(()=>document.documentElement.dataset.keyboard==='true');await page.waitForTimeout(450);
    assert.match(adb('shell','dumpsys','input_method'),/mInputShown=true/,'必须由真实 Android 输入法弹出');
    const open=await measure();assert.ok(open.keyboard>100);
    assert.ok(Math.abs(open.dock.y-before.dock.y)<1,'Dock 弹出键盘后应保持原位置');
    assert.equal(open.bottom,before.bottom,'系统安全区不能混入键盘高度');
    assert.ok(open.input.top>=0&&open.input.bottom<=open.height-open.keyboard+1,'正在编辑的输入框应位于键盘上方');
    assert.ok(Math.abs(open.host.height-(open.height-open.keyboard))<1,'输入区域应避让键盘');
    if(open.dialog)assert.ok(open.dialog.bottom<=open.height-open.keyboard+1,'弹窗应避让键盘');
    if(screenshot)await writeFile(`build/evidence/${prefix}-${screenshot}.png`,execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{timeout:20000}));
    // 输入通过 WebView 的编辑器，确认键盘变化不会丢失焦点或关闭弹窗。
    const old=await input.inputValue();await input.fill(old+' ');assert.equal(await input.inputValue(),old+' ');await input.fill(old);
    adb('shell','input','keyevent','4');await page.waitForFunction(()=>document.documentElement.dataset.keyboard==='false');await page.waitForTimeout(300);
    const closed=await measure();assert.ok(Math.abs(closed.dock.y-before.dock.y)<1);assert.ok(Math.abs(closed.host.height-before.host.height)<1);
    report.measurements.push({label,before,open,closed});report.checks.push(label);console.log('PASS '+label);
  }
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="editor"]').click();await page.locator('.screen.active .import-entry').click();
  const text=page.getByRole('textbox',{name:'课表内容',exact:true});
  await keyboardCase('JSON 输入时 Dock 固定、输入框可见、收起后恢复',text,'keyboard-import');
  await text.fill(JSON.stringify({term:{startDate:'2026-09-01'},courses:[{name:'键盘验证课程',day:1,start:1,end:2,weeks:[1],room:'16栋203号教室'}]}));
  await page.getByRole('button',{name:'解析并预览',exact:true}).click();
  await page.locator('dialog[open]').filter({hasText:'确认这份课表'}).waitFor();
  await keyboardCase('导入预览弹窗输入保持可见且未丢失焦点',page.getByRole('textbox',{name:'学校名称（导航到楼栋时使用）',exact:true}),'keyboard-dialog');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await text.fill('');
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-setting="notifications"]').click();
  await page.getByRole('button',{name:/台词管理/}).click();
  await keyboardCase('页面下部台词输入滚到键盘上方，Dock 仍固定',page.getByRole('textbox',{name:'第 1 句台词',exact:true}),'keyboard-lyrics');
  await page.getByRole('button',{name:'首页',exact:true}).click();
  report.completed=true;
}finally{
  if(page){await page.evaluate(()=>{const active=document.activeElement;if(active instanceof HTMLElement)active.blur();}).catch(()=>{});await page.reload().catch(()=>{});}
  await writeFile(`build/evidence/${prefix}-keyboard.json`,JSON.stringify(report,null,2));
  await device.close();adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');
}
