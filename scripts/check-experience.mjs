import {goTab,pasteJSON} from './check-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const active=()=>page.locator('.screen.active');
async function home(){await goTab(page,'列表');}
async function settings(route){if(['editor','schedule-settings','period-count','times'].includes(route)){await home();await page.getByRole('button',{name:'课表管理',exact:true}).click();if(route==='times')await page.getByRole('button',{name:'上课时间',exact:true}).click();else if(route!=='editor')await page.getByRole('button',{name:/开学日期与课程节数/}).click();}else{await goTab(page,'设置');await page.locator(`[data-setting="${route}"]`).click();}}
async function back(){await active().getByRole('button',{name:'返回上一页',exact:true}).click();await page.waitForTimeout(400);}
try{
 await page.goto(url);await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await settings('schedule-settings');
 const name=active().getByRole('textbox',{name:'课表名称',exact:true});const original=await name.inputValue();
 await name.fill('不应丢失的草稿');await back();
 let dialog=page.getByRole('dialog',{name:'有尚未保存的内容',exact:true});await dialog.waitFor();
 await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await name.inputValue(),'不应丢失的草稿');
 await back();await page.getByRole('dialog').getByRole('button',{name:'放弃修改并离开',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.screen.active')?.dataset.screen==='editor');await page.waitForTimeout(350);
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:/开学日期与课程节数/}).click();assert.equal(await active().getByRole('textbox',{name:'课表名称',exact:true}).inputValue(),original);
 pass('返回保护学期草稿：继续编辑保留，放弃后复原');
 await active().getByRole('textbox',{name:'课表名称',exact:true}).fill('保存后离开学期');
 await page.evaluate(()=>{window.dolphinBack('start',0,0,.5);window.dolphinBack('progress',.4,0,.5);window.dolphinBack('commit',1,0,.5);});
 await page.getByRole('dialog',{name:'有尚未保存的内容'}).getByRole('button',{name:'保存后离开',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.screen.active')?.dataset.screen==='editor');await page.waitForTimeout(350);
 await goTab(page,'列表');await page.getByRole('button',{name:'课表管理',exact:true}).click();await page.getByRole('button',{name:/开学日期与课程节数/}).click();assert.equal(await active().getByRole('textbox',{name:'课表名称',exact:true}).inputValue(),'保存后离开学期');
 pass('系统预测返回保存后正确离开且重进仍保留');
 await active().getByRole('spinbutton',{name:'学期周数',exact:true}).fill('0');await back();
 await page.getByRole('dialog').getByRole('button',{name:'保存后离开',exact:true}).click();
 await active().getByRole('alert').waitFor();assert.equal(await active().getAttribute('data-screen'),'schedule-settings');
 assert.equal(await active().getByRole('spinbutton',{name:'学期周数',exact:true}).inputValue(),'0');
 await active().getByRole('spinbutton',{name:'学期周数',exact:true}).fill('21');await active().getByRole('button',{name:'保存课表设置',exact:true}).click();
 pass('无效学期保存失败留在编辑页，保留输入并明确说明');
 await back();await active().locator('.import-entry').click();await pasteJSON(page);await active().getByRole('textbox',{name:'课表内容',exact:true}).fill('{"unfinished":');
 await goTab(page,'列表');await page.getByRole('dialog',{name:'有尚未保存的内容'}).getByRole('button',{name:'继续编辑',exact:true}).click();
 assert.equal(await active().getByRole('textbox',{name:'课表内容',exact:true}).inputValue(),'{"unfinished":');
 const schedule={term:{name:'导入体验',startDate:'2026-09-01',weeks:52},courses:[{name:'体验课程',day:2,start:1,end:2,weeks:[1,30,52],room:'16-203',teacher:'测试教师'}]};
 await pasteJSON(page);await active().getByRole('textbox',{name:'课表内容',exact:true}).fill(JSON.stringify(schedule));await active().getByRole('button',{name:'解析并预览',exact:true}).click();
 await page.getByRole('dialog',{name:'确认这份课表',exact:true}).locator('.term-date-trigger').click();
 const calendar=page.getByRole('dialog',{name:'学期开始日期',exact:true});await calendar.waitFor();
 assert.equal(await calendar.locator('input[type=date]').count(),0);await calendar.getByRole('button',{name:/关闭/}).click();
 await page.getByRole('dialog',{name:'确认这份课表',exact:true}).getByRole('button',{name:'返回修改',exact:true}).click();
 assert.equal(await active().getByRole('textbox',{name:'课表内容',exact:true}).inputValue(),JSON.stringify(schedule));
 pass('导入预览统一应用月历，返回修改保留 JSON，切页不静默丢失');
 await goTab(page,'设置');await page.getByRole('dialog').getByRole('button',{name:'放弃修改并离开',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.screen.active')?.dataset.screen==='editor');await page.waitForTimeout(350);await goTab(page,'设置');
 await page.locator('[data-setting="about"]').click();const link=active().getByRole('link',{name:/作者 GitHub/});assert.equal(await link.getAttribute('href'),'https://github.com/tequed232/');
 await active().getByRole('button',{name:'重新查看使用引导'}).click();await page.getByRole('button',{name:'先逛一逛',exact:true}).click();assert.equal(await active().getAttribute('data-screen'),'about');
 pass('关于页作者链接准确，重看引导不重置设置或跳走当前页');
 await back();await page.locator('[data-setting="appearance"]').click();
 await active().getByRole('button',{name:/深浅模式/}).click();await page.keyboard.press('Escape');assert.equal(await active().getAttribute('data-screen'),'appearance');assert.equal(await page.locator('[role=listbox]').count(),0);
 pass('下拉选项 Escape 只关闭列表，不意外返回页面');
 assert.deepEqual(errors,[]);pass('全部流程没有浏览器运行异常');
}finally{
 await mkdir('build/evidence',{recursive:true});await writeFile(`build/evidence/${version}-experience-results.json`,JSON.stringify({version,checks,errors},null,2));await browser.close();
}
