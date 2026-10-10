import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const url=process.env.TEST_URL??'http://127.0.0.1:5173';
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1304,height:892},locale:'zh-CN'});
const checks=[],errors=[],geometry=[];let completed=false;
await mkdir('build/evidence',{recursive:true});
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{window.Dolphin={postMessage(){}};});
const active=()=>page.locator('.screen.active');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dolphin-calendar',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return data;});}
async function times(){await goTab(page,'设置');await active().locator('[data-setting=editor]').click();await active().getByRole('button',{name:'上课时间',exact:true}).click();await page.locator('.screen.active[data-screen=times]').waitFor();await page.waitForFunction(()=>{const r=document.querySelector('.screen.active[data-screen=times]')?.getBoundingClientRect();return r&&r.x>=-1&&r.right<=innerWidth+1;});}
async function seed(scale){
  await page.evaluate(async scale=>{
    const {initialData}=await import('/src/lib/model.ts'),{generatePeriods}=await import('/src/lib/scheduleTime.ts'),{saveData}=await import('/src/lib/storage.ts');
    const data=initialData();data.onboarded=true;data.settings={...data.settings,scale,mode:'light',autoUpdate:false};
    data.schedule.term={name:'时间布局演示学期',startDate:'2026-10-05',weeks:20};data.schedule.periods=generatePeriods(24,'06:00',20,10);
    data.schedule.courses=[{id:'time-layout-course',name:'时间布局演示课程',day:1,start:1,end:2,weeks:[1,2],color:'sage',teacher:'演示教师',room:'演示楼101',notes:'合成课表'}];
    await saveData(data);
  },scale);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.load-note'));await times();
}
const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
try{
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('.load-note'));
  for(const viewport of [{width:1304,height:892},{width:844,height:390},{width:390,height:844},{width:320,height:568}])for(const scale of [1,1.1,1.35]){
    await page.setViewportSize(viewport);await seed(scale);
    await check(`${viewport.width}×${viewport.height} / ${Math.round(scale*100)}%：24 个节次标签完整，时间控件紧凑且互不重叠`,async()=>{
      const rows=await active().locator('.period-editor').evaluateAll(rows=>rows.map(row=>{
        const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const label=row.querySelector('span'),inputs=[...row.querySelectorAll('input')],range=document.createRange();range.selectNodeContents(label);
        const r=range.getBoundingClientRect();return {row:box(row),label:{...box(label),text:label.textContent,textBox:{x:r.x,y:r.y,right:r.right,bottom:r.bottom}},inputs:inputs.map(input=>({...box(input),type:input.type,value:input.value,label:input.getAttribute('aria-label'),scrollWidth:input.scrollWidth,clientWidth:input.clientWidth})),card:box(row.closest('.time-list'))};
      }));
      assert.equal(rows.length,24);
      for(const [index,row]of rows.entries()){
        assert.equal(row.label.text,`第 ${index+1} 节`);assert.equal(row.inputs.length,2);
        const t=row.label.textBox,l=row.label;assert.ok(t.x>=l.x-1&&t.right<=l.right+1&&t.y>=l.y-1&&t.bottom<=l.bottom+1,JSON.stringify({viewport,scale,index,label:l}));
        for(const input of row.inputs){assert.equal(input.type,'time');assert.match(input.value,/^\d{2}:\d{2}$/);assert.ok(!intersects(l,input),JSON.stringify({viewport,scale,index,label:l,input}));assert.ok(input.x>=row.card.x-1&&input.right<=row.card.right+1&&input.right<=viewport.width+1,JSON.stringify({viewport,scale,index,input,card:row.card,row:row.row}));assert.ok(input.width<=112*scale+1,'时间输入不应扩张成巨大的整行块');assert.ok(input.height>=44);assert.ok(input.scrollWidth<=input.clientWidth+1,'时间输入内容不能横向溢出');}
        assert.ok(!intersects(row.inputs[0],row.inputs[1]),JSON.stringify({viewport,scale,index,inputs:row.inputs}));
      }
      assert.ok(await active().evaluate(screen=>screen.scrollWidth<=screen.clientWidth+1));
      geometry.push({viewport,scale,rows});
    });
    if(scale===1||scale===1.35)await page.screenshot({path:`build/evidence/${version}-time-settings-${viewport.width}x${viewport.height}-${Math.round(scale*100)}.png`});
  }
  await check('窄屏较大字体下真实时间输入可保存，刷新后值与原课程保留',async()=>{
    const before=await state();await active().getByRole('textbox',{name:'第1节开始',exact:true}).fill('06:05');await active().getByRole('button',{name:'保存课表设置',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.screen.active button.primary')?.disabled);const saved=await state();
    assert.equal(saved.schedule.periods[0].start,'06:05');assert.equal(saved.schedule.periods[0].end,'06:20');assert.deepEqual(saved.schedule.courses,before.schedule.courses);assert.deepEqual(saved.schedule.term,before.schedule.term);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('.load-note'));await times();assert.equal(await active().getByRole('textbox',{name:'第1节开始',exact:true}).inputValue(),'06:05');
  });
  await check('自动顺延沿用原时间事件，应用前不写数据，保存后全部 24 节一致',async()=>{
    const before=await state();await active().getByRole('button',{name:/^自动顺延后续课程/}).click();const dialog=page.getByRole('dialog',{name:'自动顺延',exact:true});await dialog.waitFor();
    await dialog.getByRole('textbox',{name:'第一节开始时间',exact:true}).fill('07:00');await dialog.getByRole('spinbutton',{name:'每节课时长（分钟）',exact:true}).fill('20');await dialog.getByRole('spinbutton',{name:'课间（分钟）',exact:true}).fill('10');
    await dialog.getByRole('button',{name:'应用到 24 节',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await state(),before);
    await active().getByRole('button',{name:'保存课表设置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.screen.active button.primary')?.disabled);
    const saved=await state();assert.equal(saved.schedule.periods.length,24);assert.equal(saved.schedule.periods[0].start,'07:00');assert.equal(saved.schedule.periods[0].end,'07:20');assert.equal(saved.schedule.periods[23].start,'18:30');assert.equal(saved.schedule.periods[23].end,'18:50');assert.deepEqual(saved.schedule.courses,before.schedule.courses);assert.deepEqual(saved.schedule.term,before.schedule.term);
  });
  assert.deepEqual(errors,[]);completed=true;
}finally{
  if(!completed)await page.screenshot({path:`build/evidence/${version}-time-settings-failure.png`}).catch(()=>{});
  await writeFile(`build/evidence/${version}-time-settings-layout-results.json`,JSON.stringify({version,completed,checks,errors,geometry},null,2));
  await browser.close();
}
