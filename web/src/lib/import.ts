import { DEFAULT_PERIODS, PALETTE, type Course, type Schedule, type Period } from './model';
import {gridSchedule,tableRows} from './htmlTable';
type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => v && typeof v === 'object' && !Array.isArray(v) ? v as Dict : {};
const pick = (o: Dict, ...keys: string[]) => keys.map(k=>o[k]).find(v=>v!==undefined && v!==null);
const str = (v: unknown) => v==null?'':String(v).normalize('NFKC').trim();
function fail(message: string): never { throw new Error(message); }
export function parseNumbers(value: unknown, max: number, label: string): number[] {
  if(Array.isArray(value)) return [...new Set(value.flatMap(v=>parseNumbers(v,max,label)))].sort((a,b)=>a-b);
  let s = str(value).replace(/[第周节\s]/g,'').replace(/[，、；;]/g,',').replace(/[~～至—–]/g,'-');
  if(label==='周次'&&/^(?:单|双|每|全部|全|全年|全学年)$/.test(s))s=`1-${max}${s==='单'||s==='双'?s:''}`;
  const parity = /单/.test(s)?1:/双/.test(s)?0:null; s=s.replace(/[单双()（）]/g,'');
  if(!s) return fail(`${label}不能为空`);
  const result: number[] = [];
  for(const part of s.split(',')) {
    if(!/^\d+(?:-\d+)?$/.test(part)) fail(`${label}格式错误：${str(value)}`);
    const [from,to=from] = part.split('-').map(Number);
    if(from<1 || to>max || from>to) fail(`${label}必须在 1–${max} 范围内，且起止顺序正确`);
    for(let i=from;i<=to;i++) if(parity===null || i%2===parity) result.push(i);
  }
  if(!result.length) fail(`${label}没有可用数字`);
  return [...new Set(result)].sort((a,b)=>a-b);
}
export function parseDay(value: unknown): number {
  const s = str(value).replace(/^(星期|礼拜|周)/,'').toLowerCase();
  const aliases: Record<string,number> = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7,mon:1,monday:1,tue:2,tuesday:2,wed:3,wednesday:3,thu:4,thursday:4,fri:5,friday:5,sat:6,saturday:6,sun:7,sunday:7};
  const n = aliases[s]??Number(s); if(!Number.isInteger(n)||n<1||n>7) fail(`无法识别星期：${str(value)}`); return n;
}
export function normalizeRoom(value: unknown): {room:string;incomplete:boolean;multiple:boolean} {
  const original=str(value).replace(/^(?:教室|地点)[:：]\s*/,'').replace(/\s+/g,' ').trim();
  if(!original)return {room:'',incomplete:false,multiple:false};
  if(/(?:\.{2,}|…|待定)/.test(original))return {room:original,incomplete:true,multiple:false};
  const withoutSchool=original.replace(/^.{2,25}?(?:大学|学院|学校)(?:.{0,12}?校区)?(?=.{1,20}(?:楼|栋|教室))/,'').trim();
  const numbered=withoutSchool.match(/^(\d{1,3})\s*[-－—栋楼#]\s*([A-Za-z]?\d{2,4})(?:\s*(?:号)?(?:教室|室))?(?:\s*[\/／]\s*([A-Za-z]?\d{2,4}))*$/);
  if(numbered)return {room:`${Number(numbered[1])}栋${numbered[2].toUpperCase()}号教室`,incomplete:false,multiple:/[\/／]/.test(withoutSchool)};
  const named=withoutSchool.match(/^(.{1,20}?(?:楼|栋))\s*([A-Za-z]?\d{2,4})(?:\s*(?:号)?(?:教室|室))?$/);
  if(named)return {room:`${named[1]}${named[2].toUpperCase()}号教室`,incomplete:false,multiple:false};
  return {room:withoutSchool,incomplete:false,multiple:false};
}
/** Route to the building entrance; room numbers remain visible in the course and notification. */
export function navigationPlace(room: string): string {
  const clean=str(room);
  const numbered=clean.match(/^(\d{1,3})\s*(?:栋|楼|[-－—])/);
  if(numbered)return `${Number(numbered[1])}栋`;
  const named=clean.match(/^(.{1,24}?(?:栋|楼|馆|教学楼|体育场))/);
  return named?.[1]??(/(?:\.{2,}|…|待定)/.test(clean)?'':clean);
}
function flattenPeriods(periods: unknown[]): Dict[] {
  const result: Dict[] = [];
  periods.forEach((raw,index)=>{
    const p=obj(raw); if(!Array.isArray(p.days)) fail(`第 ${index+1} 个 period 缺少 days 数组`);
    (p.days as unknown[]).forEach((day,dayIndex)=>{
      if(day==null || day==='') return;
      for(const item of Array.isArray(day)?day:[day]) {
        if(item==null||item==='') continue;
        const c=typeof item==='string'?{name:item}:obj(item);
        result.push({day:dayIndex+1,...c,start:index+1,end:index+1,_matrix:true});
      }
    });
  }); return result;
}
export function normalizeSchedule(raw: unknown, current: Schedule): Schedule {
  const root=Array.isArray(raw)?{courses:raw}:obj(raw), wrapped=root.schedule??root.data??root.result;
  const data=wrapped!==undefined?(Array.isArray(wrapped)?{...root,courses:wrapped}:{...root,...obj(wrapped)}):root;
  const term=obj(data.term??data.semester);
  const notes:string[]=[];
  const termName=str(term.name??data.termName??(typeof data.term==='string'?data.term:undefined))||current.term.name;
  const suppliedDate=str(pick(term,'startDate','start')??pick(data,'startDate','semesterStart','termStart'));
  const year=Number(termName.match(/20\d{2}/)?.[0]??(new Date().getFullYear()-(new Date().getMonth()<8?1:0)));
  const startDate=suppliedDate||`${year}-09-01`;
  if(!suppliedDate)notes.push(`文件未提供开学日期，暂设为 ${startDate}；请在下方确认或修改。`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(Date.parse(startDate))||new Date(startDate).toISOString().slice(0,10)!==startDate) fail('学期开始日期应为有效的 YYYY-MM-DD');
  const declaredWeeks=term.weeks??data.totalWeeks;
  let weeks=declaredWeeks==null?0:Number(declaredWeeks);
  if(declaredWeeks!=null&&(!Number.isInteger(weeks)||weeks<1||weeks>999)) fail('文件里的学期周数必须是 1–999 的整数');
  const periodInput = data.times??data.periodTimes??(Array.isArray(data.periods)&&!data.periods.some(p=>obj(p).days)?data.periods:undefined);
  let periods=current.periods.length?current.periods:DEFAULT_PERIODS;
  const matrix=Array.isArray(data.periods)&&data.periods.some(p=>Array.isArray(obj(p).days));
  if(matrix){
    periods=(data.periods as unknown[]).map((raw,i):Period=>{
      const p=obj(raw),label=str(p.period??p.name??`${i*2+1}-${i*2+2}`).replace(/^第/,'').replace(/节$/,'');
      const times=str(p.time??p.timeRange).match(/(\d{1,2}:\d{2})\s*[-–—~至]\s*(\d{1,2}:\d{2})/);
      if(times)return {label,start:times[1].padStart(5,'0'),end:times[2].padStart(5,'0')};
      // 旧版分组节次本身就是一个授课时段，保留组名，避免“中午1”与“上午1”混淆。
      if(/中午|午间/.test(label))return {label,start:'',end:''};
      const numbers=parseNumbers(label,24,'节次');return {label,start:DEFAULT_PERIODS[numbers[0]-1]?.start??'',end:DEFAULT_PERIODS[numbers.at(-1)!-1]?.end??''};
    });
    if(periods.length>24)fail('节次分组过多，请控制在 24 组以内');
  }
  if(periodInput!==undefined) {
    if(!Array.isArray(periodInput)||!periodInput.length||periodInput.length>24) fail('节次时间必须是 1–24 项数组');
    periods=periodInput.map((raw,i)=>{
      const p=obj(raw),start=str(p.start),end=str(p.end);
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end) fail(`第 ${i+1} 节的起止时间无效`);
      return {start,end,...(p.label?{label:str(p.label)}:{})};
    });
    if(periods.some((p,i)=>i>0&&p.start<periods[i-1].end)) fail('节次时间不能重叠或倒序');
  }
  const list=pick(data,'courses','lessons','items','list');
  const input = Array.isArray(list)?list:matrix?flattenPeriods(data.periods as unknown[]):fail('找不到 courses 或包含 days 的 periods 数组');
  if(!input.length) fail('没有可导入的课程；原课表未被更改');
  if(input.length>2000) fail('课程条目超过 2000 条；请按学年拆分文件后导入');
  // 先按合理上限解析显式周次，再确定学期长度；不拿默认 20 周裁掉真实课程。
  const explicitWeeks=input.map((item,i)=>{const c=obj(item),v=pick(c,'weeks','week','weekRange','weeksText','周次');if(v==null||str(v)===''||/^(?:单周|双周|每周|全周|全部|全年|全学年)$/.test(str(v)))return null;try{return parseNumbers(v,999,'周次');}catch(e){fail(`第 ${i+1} 条课程：${(e as Error).message}`);}});
  const detected=Math.max(0,...explicitWeeks.flatMap(v=>v??[]));
  if(declaredWeeks==null){weeks=detected||52;notes.push(detected?`已从课程周次推断这份课表为 ${weeks} 周。`:'文件未标明周次或学年长度，暂按 52 周处理；请在导入预览中核对。');}
  else if(detected>weeks){notes.push(`课程包含第 ${detected} 周，学期长度已由 ${weeks} 周扩展为 ${detected} 周。`);weeks=detected;}
  const instances=explicitWeeks.reduce((sum,item)=>sum+(item?.length??weeks),0);
  if(instances>20_000)fail(`课表共安排约 ${instances} 次上课，超过单次导入 20000 次的设备保护上限；请按学年拆分后导入`);
  const courses: Course[]=[];let defaultedWeeks=0,normalizedRooms=0,multipleRooms=0;
  input.forEach((item,i)=>{
    try {
      const c=obj(item),name=str(pick(c,'name','course','courseName','title','课程名','课程名称'));
      if(!name) fail('缺少课程名');
      const sections=pick(c,'sections','periods','period','section','periodName','节次','时段');
      const nums=!c._matrix&&sections!==undefined?parseNumbers(sections,periods.length,'节次'):parseNumbers(`${pick(c,'start','startPeriod','periodStart','节次起')??''}-${pick(c,'end','endPeriod','periodEnd','节次止')??pick(c,'start','startPeriod','periodStart','节次起')??''}`,periods.length,'节次');
      if(nums.length!==nums.at(-1)!-nums[0]+1) fail('同一课程的节次必须连续，请拆成多条课程');
      const weekValue=pick(c,'weeks','week','weekRange','weeksText','周次');if(weekValue==null||str(weekValue)==='')defaultedWeeks++;
      const originalRoom=str(pick(c,'room','classroom','location','place','教室'));
      const location=normalizeRoom(originalRoom);
      if(location.incomplete)notes.push(`第 ${i+1} 条课程的教室“${originalRoom}”不完整，请在导入后手动核对；楼栋明确时仅导航到楼栋。`);
      if(location.room!==originalRoom)normalizedRooms++;
      if(location.multiple)multipleRooms++;
      const originalNote=location.multiple?`原始教室：${originalRoom}`:'';
      const value: Course={id:`course-${i}-${crypto.randomUUID()}`,name,teacher:str(pick(c,'teacher','teacherName','教师','老师')),room:location.room,day:parseDay(pick(c,'day','weekday','weekDay','dayOfWeek','星期','周几')),start:nums[0],end:nums.at(-1)!,weeks:explicitWeeks[i]??parseNumbers(weekValue==null||str(weekValue)===''?`1-${weeks}`:weekValue,weeks,'周次'),color:PALETTE.includes(str(c.color))?str(c.color):PALETTE[i%PALETTE.length],notes:[str(pick(c,'notes','备注')),originalNote].filter(Boolean).join('\n')};
      courses.push(value);
    } catch(e) { fail(`第 ${i+1} 条课程：${(e as Error).message}`); }
  });
  if(defaultedWeeks)notes.push(`${defaultedWeeks} 条课程未填写周次，按本学期每周上课处理，请核对。`);
  if(normalizedRooms)notes.push(`${normalizedRooms} 条教室已规范为便于导航的楼栋与房间写法。`);
  if(multipleRooms)notes.push(`${multipleRooms} 条课程含多个教室，导航先使用第一个；原始教室已保留在课程备注。`);
  if(periods.some(p=>!p.start||!p.end))notes.push('部分节次没有起止时间，请在课表编辑中补齐；这些时段暂不发送定时提醒。');
  return {term:{name:termName,startDate,weeks},periods,courses,importNotes:notes};
}
export function parseImport(text: string, format: 'auto' | 'json' | 'html' | 'text', current: Schedule): Schedule {
  const clean=text.trim().replace(/^```(?:json|html|text)?\s*\n?/i,'').replace(/\n?```\s*$/,'').trim();
  if(!clean) fail('没有可用内容，请选择文件或粘贴课表');
  if(clean.length>5_000_000) fail('文件超过 5 MB，请精简后导入');
  const mode=format==='auto'?(/^[{[]/.test(clean)||/```json\s*[{[]/i.test(clean)?'json':/<(?:table|html)\b/i.test(clean)?'html':'text'):format;
  if(mode==='json') {
    let raw:unknown;try{raw=JSON.parse(clean);}catch{
      const opened=clean.search(/[{[]/);if(opened<0)fail('JSON 中没有对象或数组');
      const stack:string[]=[],start=clean[opened],pairs:Record<string,string>={'}':'{',']':'['};let quoted=false,escaped=false,closed=-1;
      for(let i=opened;i<clean.length;i++){
        const ch=clean[i];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
        if(ch==='"'){quoted=true;continue;}if(ch==='{'||ch==='[')stack.push(ch);
        else if(ch==='}'||ch===']'){if(stack.pop()!==pairs[ch])fail('JSON 括号不匹配');if(!stack.length){closed=i+1;break;}}
      }
      if(closed<0||!start)fail('JSON 括号未闭合');
      try{raw=JSON.parse(clean.slice(opened,closed));}catch(e){fail(`JSON 语法错误：${(e as Error).message}`);}
    }return normalizeSchedule(raw,current);
  }
  if(mode==='html') {
    const doc = new DOMParser().parseFromString(clean,'text/html');
    const embedded=doc.querySelector('script[type="application/json"][id="dolphin-schedule"]');
    if(embedded) return parseImport(embedded.textContent??'','json',current);
    const tables=[...doc.querySelectorAll('table')]; if(!tables.length) fail('HTML 缺少课表 table 或 dolphin-schedule JSON 数据块');
    for(const table of tables){
      const grid=gridSchedule(table);if(grid)return normalizeSchedule(grid,current);
      const rows=tableRows(table),header=rows.findIndex(r=>r.some(h=>['课程名','课程名称','name','courseName'].includes(h)));
      if(header>=0)return parseTable(rows.slice(header),current);
    }
    fail('没有找到包含课程表头的表格，请检查文件是否为完整课表');
  }
  const rows=clean.split(/\r?\n/).filter(l=>l.trim()&&!/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map(l=>l.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split(/\t|\|/).map(s=>s.trim()));
  return parseTable(rows,current);
}
function parseTable(rows:string[][],current:Schedule):Schedule {
  if(rows.length<2) fail('文本或表格需要表头与至少一行课程。列名：课程名、星期、节次、周次、教师、教室；用制表符或 | 分隔');
  const headers=rows[0];
  if(!headers.some(h=>['课程名','课程名称','name','courseName'].includes(h))) fail('找不到课程名表头，请使用应用内的导入提示词转换');
  return normalizeSchedule({courses:rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))},current);
}
export const JSON_PROMPT = `请把我提供的课表整理为 JSON。不要猜测不清晰的信息，先向我询问。输出可直接导入 Dolphin Calendar 的对象：{"term":{"name":"学期名称","startDate":"YYYY-MM-DD","weeks":20},"courses":[{"name":"课程名","teacher":"教师","room":"X栋XXX号教室","day":1,"start":1,"end":2,"weeks":[1,2,3],"notes":""}]}。教室请尽量写为“16栋203号教室”；若原文是“16-203/202”，将主教室写为“16栋203号教室”，另一间写入 notes。楼名明确时可写“博学楼A203号教室”。不要把学校名写入 room；地址不完整时保留原文并提示用户核对，切勿补造数字。day 为周一=1至周日=7；start/end 为节次；weeks 逐项写明实际周次，不可丢失单双周。若不知道学期开始日期，请省略 startDate。不得编造课程或时间。`;
export const HTML_PROMPT = `${JSON_PROMPT}\n请将同一份 JSON 放入 HTML 的 <script type="application/json" id="dolphin-schedule"> 数据块，并另外生成可读的课表 table。表头为课程名、星期、节次、周次、教师、教室。只输出完整 HTML 文件，不加载任何外部资源或执行脚本。`;
