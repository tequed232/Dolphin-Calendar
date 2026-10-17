import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{window.__commands=[];window.Dolphin={postMessage(raw){window.__commands.push(JSON.parse(raw));}};});
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173');await page.getByRole('button',{name:'先逛一逛',exact:true}).click();
 await page.evaluate(async()=>{
  const {initialData}=await import('/src/lib/model.ts'),{saveData}=await import('/src/lib/storage.ts'),value=initialData();
  value.onboarded=true;value.settings.autoUpdate=false;
  value.schedule.courses=[{id:'dated-empty',name:'指定日期课程',day:1,start:1,end:2,weeks:[],specificDate:'2026-10-05',temporary:true,teacher:'',room:'',notes:'',color:'sage'}];
  await saveData(value);
 });
 await page.reload();await goTab(page,'设置');await page.locator('.screen.active [data-setting=editor]').click();
 await page.locator('.screen.active').getByRole('button',{name:/导入到系统日历/}).click();const screen=page.locator('.screen.active');
 assert.match(await screen.locator('.calendar-count').innerText(),/1 次上课/);
 assert.equal(await screen.getByRole('button',{name:'导入到系统日历',exact:true}).isEnabled(),true);
 checks.push('有指定日期且重复周次为空的课程，仍计为一次上课并允许导入');
 await screen.getByRole('button',{name:'导入到系统日历',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();
 const command=await page.evaluate(()=>window.__commands.findLast(item=>item.type==='calendarSync'));assert.ok(command);assert.equal(command.schedule.courses[0].specificDate,'2026-10-05');assert.deepEqual(command.schedule.courses[0].weeks,[]);
 await page.evaluate(()=>window.dolphinNative({type:'calendarResult',action:'calendarSync',permission:true,count:1,success:true,canRestore:true,message:'已导入 1 次上课到系统日历'}));
 await screen.getByText('Dolphin 课程日历中已有 1 次上课',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(async()=>{const {loadData}=await import('/src/lib/storage.ts');return (await loadData()).schedule.courses[0].weeks;}),[]);
 checks.push('确认将原始指定日期发送给原生桥，结果显示一次且不改课表');
 assert.deepEqual(errors,[]);console.log(checks.map(check=>'PASS '+check).join('\n'));
}finally{await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/system-calendar-count.json',JSON.stringify({checks,errors,success:checks.length===2&&!errors.length},null,2));await browser.close();}
