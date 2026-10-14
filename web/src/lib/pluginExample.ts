import type {PluginPackage} from './plugins';
export const EXAMPLE_PLUGIN:PluginPackage={
  manifest:{id:'quiet-week',name:'静谧课表',version:'1.0.0',apiVersion:1,minAppVersion:'1.5.1',author:'Dolphin Calendar',description:'展示选中日期的课程、体验柔和主题，并将简单文本交给内置导入预览。',permissions:['schedule:read','navigation:date','course:open','storage:local','theme:app','schedule:import'],contributes:{view:true,theme:{light:{'--accent':'#516D56','--accent-soft':'#EAF1E8','--canvas':'#F4F6F1'},dark:{'--accent':'#BDD6BD','--accent-soft':'#2B3B2E','--canvas':'#141A16'}}}},
  html:'<main><header><div><small>静谧课表 · SDK 示例</small><h1 id="date">正在读取课表</h1></div><div class="date-actions"><button id="previous" aria-label="前一天">‹</button><button id="today">今天</button><button id="next" aria-label="后一天">›</button></div></header><p id="status" role="status"></p><div id="courses"></div><details><summary>体验自定义导入</summary><p>每行：课程名称 | 星期 1–7 | 开始节次 | 结束节次 | 周次（逗号分隔）</p><textarea id="source" aria-label="待转换的课程文本" placeholder="示例课程 | 1 | 1 | 2 | 1,2,3"></textarea><button id="convert">转换并打开内置预览</button></details></main>',
  css:'body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.55 system-ui}main{padding:18px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.date-actions{display:flex;gap:6px}h1{font-size:24px;margin:4px 0}small,p{color:var(--muted)}button{padding:10px 14px;border:0;border-radius:12px;background:var(--accent-soft);color:var(--accent);font:inherit;cursor:pointer}.course{padding:16px;margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:16px}.course h2{margin:0 0 6px;font-size:18px}.course p{margin:0 0 10px}details{margin-top:20px}textarea{display:block;box-sizing:border-box;width:100%;min-height:90px;margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--input);color:var(--ink);font:inherit}',
  javascript:String.raw`
const sdk=window.DolphinPlugin;
const status=document.getElementById('status');
const report=error=>{status.textContent=error.message||String(error)};
let generation=0;
async function render(context){
  const ticket=++generation;
  document.getElementById('date').textContent=context.date;
  for(const [name,value] of Object.entries(context.tokens))document.documentElement.style.setProperty(name,value);
  document.documentElement.style.colorScheme=context.mode;
  const courses=await sdk.getCourses(context.date);
  if(ticket!==generation)return;
  const holder=document.getElementById('courses');holder.replaceChildren();
  for(const course of courses){
    const article=document.createElement('article');article.className='course';
    const title=document.createElement('h2');title.textContent=course.name;
    const info=document.createElement('p');info.textContent='第 '+course.start+'–'+course.end+' 节 · '+(course.room||'教室未填写')+' · '+(course.teacher||'教师未填写');
    const open=document.createElement('button');open.textContent='查看课程详情';open.onclick=()=>sdk.openCourse(course.id).catch(report);
    article.append(title,info,open);holder.append(article);
  }
  if(!courses.length){const text=document.createElement('p');text.textContent='这一天没有课程';holder.append(text)}
}
function dateKey(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
async function moveDate(delta){const context=await sdk.getContext();const date=new Date(context.date+'T12:00:00');date.setDate(date.getDate()+delta);await sdk.selectDate(dateKey(date))}
document.getElementById('previous').onclick=()=>moveDate(-1).catch(report);
document.getElementById('next').onclick=()=>moveDate(1).catch(report);
document.getElementById('today').onclick=()=>sdk.selectDate(dateKey(new Date())).catch(report);
document.getElementById('convert').onclick=async()=>{
  try{
    const text=document.getElementById('source').value;
    if(!text.trim())throw new Error('请先填写课程文本');
    const context=await sdk.getContext();
    const courses=text.trim().split(/\r?\n/).filter(Boolean).map(line=>{
      const [name,day,start,end,weeks]=line.split('|').map(value=>value.trim());
      if(!name||!day||!start||!end||!weeks)throw new Error('请按示例提供所有字段');
      return {name,teacher:'',room:'',day:Number(day),start:Number(start),end:Number(end),weeks:weeks.split(',').map(Number),notes:''};
    });
    await sdk.saveData({source:text});
    await sdk.requestImport(JSON.stringify({term:context.schedule.term,periods:context.schedule.periods,courses}));
  }catch(error){report(error)}
};
sdk.onContext(context=>render(context).catch(report));
sdk.ready().then(()=>sdk.loadData()).then(value=>{if(value&&typeof value.source==='string')document.getElementById('source').value=value.source}).catch(report);
`
};
