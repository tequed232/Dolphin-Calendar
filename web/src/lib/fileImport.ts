import * as XLSX from '@e965/xlsx';
import {applyPeriodTimes,type ImportedPeriodTime as TableTime} from './importTime';
import {normalizeSchedule,parseDay,parseImport,parseNumbers} from './import';
import {DEFAULT_PERIODS,type Schedule,type Course,type RestTime} from './model';
import {MAX_PERIODS,importedTime,restLabel,applyRestTimes} from './scheduleTime';
export type Sheet={name:string;rows:string[][];merges:{s:{r:number;c:number};e:{r:number;c:number}}[]};
export type Mapping={dayRow:number;sectionColumn:number;firstRow:number;lastRow:number;firstColumn:number;lastColumn:number};
export type ImportResult={schedule:Schedule;errors:string[];blocks:number;days:number[]};
export type FileSource={sheets:Sheet[];format:'json'|'csv'|'excel';json?:string};
const MAX_ROWS=3000,MAX_COLUMNS=100;
export function decodeText(bytes:Uint8Array){
 const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
 try{return new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{try{return new TextDecoder('gb18030',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw new Error('无法读取文本编码，请使用 UTF-8 或 GB18030');}}
}
export function csvRows(text:string){
 const first=text.split(/\r?\n/)[0]??'',separator=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
 const rows:string[][]=[],row:string[]=[];let field='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||!field)quoted=!quoted;else field+=ch;}
 else if(!quoted&&ch===separator){row.push(field);field='';}
 else if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;field='';}
 else field+=ch;
 if(rows.length>MAX_ROWS||row.length>MAX_COLUMNS)throw new Error('表格超过 3000 行或 100 列');
 }
 if(quoted)throw new Error('CSV 引号未闭合');row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export type FileFormat=FileSource['format'];
export class FileFormatError extends Error {constructor(message:string,public suggested?:FileFormat){super(message);}}
function detectFileFormat(name:string,bytes:Uint8Array):FileFormat{
 const extension=name.split('.').at(-1)?.toLowerCase(),expected=extension==='json'?'json':extension==='csv'?'csv':['xls','xlsx'].includes(extension??'')?'excel':undefined;
 const workbook=(bytes[0]===0x50&&bytes[1]===0x4b)||(bytes[0]===0xd0&&bytes[1]===0xcf);
 let content:FileFormat|undefined;
 if(workbook)content='excel';
 else {const text=decodeText(bytes).trim();if(/^(?:[{[]|```json)/i.test(text))content='json';else if(/[,;\t]/.test(text.split(/\r?\n/)[0])&&/\r?\n/.test(text))content='csv';}
 if(expected&&content&&expected!==content)throw new FileFormatError(`文件扩展名 .${extension} 与内容不一致，内容更像 ${content==='excel'?'Excel':content.toUpperCase()}。请确认格式后继续。`,content);
 if(content)return content;if(expected)return expected;
 throw new FileFormatError('无法自动识别课表格式。支持 JSON、CSV、XLSX 和 XLS 文件；请核对文件内容或手动指定格式。');
}
export async function readScheduleFile(file:File,override?:FileFormat):Promise<FileSource>{
 if(file.size>5_000_000)throw new Error('文件超过 5 MB，请精简后导入');
 if(!file.size)throw new Error('文件为空，请选择包含课表数据的文件');
 const bytes=new Uint8Array(await file.arrayBuffer()),format=override??detectFileFormat(file.name,bytes);
 if(format==='json')return {format,sheets:[],json:decodeText(bytes)};
 if(format==='csv')return {format,sheets:[{name:file.name,rows:csvRows(decodeText(bytes)),merges:[]}]};
 try{
  if(!(bytes[0]===0x50&&bytes[1]===0x4b)&&!(bytes[0]===0xd0&&bytes[1]===0xcf))throw new Error('invalid workbook');
  const book=XLSX.read(bytes,{type:'array',cellDates:false,sheetRows:MAX_ROWS+1});
  if(!book.SheetNames.length)throw new Error('工作簿没有工作表');if(book.SheetNames.length>100)throw new Error('超过100个工作表');
  const sheets=book.SheetNames.map(name=>{const sheet=book.Sheets[name],ref=sheet['!fullref']??sheet['!ref'];if(ref){const range=XLSX.utils.decode_range(ref);if(range.e.r>=MAX_ROWS||range.e.c>=MAX_COLUMNS)throw new Error(`工作表「${name}」超过 3000 行或 100 列`);}
   return {name,rows:XLSX.utils.sheet_to_json<string[]>(sheet,{header:1,defval:'',raw:false,blankrows:true}),merges:sheet['!merges']??[]};});
  return {format,sheets};
 }catch(e){if((e as Error).message.includes('超过')||(e as Error).message.includes('工作表'))throw e;throw new Error('无法解析该 Excel 文件，请检查文件是否损坏、加密或与扩展名不符。');}
}
function section(value:string){const chinese:Record<string,string>={'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10','十一':'11','十二':'12','十三':'13','十四':'14','十五':'15','十六':'16','十七':'17','十八':'18','十九':'19','二十':'20','二十一':'21','二十二':'22','二十三':'23','二十四':'24'};let s=String(value).normalize('NFKC').trim().replace(/^第/,'').replace(/节$/,'').replace(/[～~至—–]/g,'-');s=s.split('-').map(v=>chinese[v]??v).join('-');return parseNumbers(s,24,'节次');}
export const CSV_FIELDS=[
 {key:'name',label:'课程名',aliases:['课程名','课程名称','课程','name','courseName'],description:'必填，例如高等数学'},
 {key:'day',label:'星期',aliases:['星期','周几','day','dayOfWeek'],description:'必填：1–7、周一至周日、Monday 或 Mon 等'},
 {key:'sections',label:'节次',aliases:['节次','时段','section','sections','period'],description:'必填方案一：1-2、第1-2节或第一节'},
 {key:'start',label:'开始节次',aliases:['开始节次','start','startSection'],description:'必填方案二：和结束节次一起填写数字，如 5'},
 {key:'end',label:'结束节次',aliases:['结束节次','end','endSection'],description:'和开始节次一起填，如 6；应不早于开始且不超过24'},
 {key:'startTime',label:'上课时间',aliases:['上课时间','开始时间','startTime','timeStart'],description:'选填，和下课时间一起填写 HH:mm（也接受 H:mm）；课程行更新开始节次的上课时间'},
 {key:'endTime',label:'下课时间',aliases:['下课时间','结束时间','endTime','timeEnd'],description:'选填；课程行更新结束节次的下课时间，连堂中间节次不作推算'},
 {key:'timeRange',label:'时间段',aliases:['时间段','时间','上课下课时间','time','timeRange'],description:'选填：08:00-08:45 或 08:00 至 08:45，可代替分开的上课 / 下课时间列'},
 {key:'weeks',label:'周次',aliases:['周次','weeks'],description:'选填：1-16、1,3,5、1-16单、1-16双；省略按学期全部周次'},
 {key:'teacher',label:'教师',aliases:['教师','老师','teacher'],description:'选填'},
 {key:'room',label:'教室',aliases:['教室','地点','room','classroom'],description:'选填，例如16栋203号教室'},
 {key:'notes',label:'备注',aliases:['备注','notes','note'],description:'选填；逗号或换行放在双引号内，内部双引号写两次'}
] as const;
const headerAliases:Record<string,string>=Object.fromEntries(CSV_FIELDS.flatMap(field=>field.aliases.map(alias=>[alias,field.key])));
export const CSV_TEMPLATE='课程名,星期,开始节次,结束节次,上课时间,下课时间,周次,教室,教师,备注\n高等数学,周三,5,6,,,1-16,16栋203号教室,陈老师,示例课程\n大学英语,Friday,3,4,,,1-16单,3栋402号教室,林老师,单周上课\n';
export const CSV_TIME_TEMPLATE='节次,上课时间,下课时间\n1,08:00,08:45\n2,08:55,09:40\n3,10:00,10:45\n4,10:55,11:40\n午休,11:40,14:00\n5,14:00,14:45\n6,14:55,15:40\n7,16:00,16:45\n8,16:55,17:40\n9,19:00,19:45\n10,19:55,20:40\n11,20:50,21:35\n12,21:45,22:30\n';
export const JSON_TIME_TEMPLATE=JSON.stringify({times:DEFAULT_PERIODS,lunchBreak:{start:'11:40',end:'14:00'}},null,2);
export const CSV_TIME_NOTES=[
 '课程示例的时间列留空，沿用当前课表。修改连堂时间时请同时核对保留的中间课时；完整替换上课时间可使用 CSV 时间模板。',
 '上课 / 下课时间会更新内置节次时间，主页、课表管理和课程编辑共用这份配置。课程行只更新开始节次的上课时间和结束节次的下课时间；连堂中间节次保留原值，不平均推算。',
 '可单独导入「节次,上课时间,下课时间」时间表，保留已有课程和 ID。时间表每行只能是一节；也可在课程表中添加课程名和星期均为空的单节时间行。',
 '完整时间行连续覆盖第 1–N 节时，将每日节数设为 N；部分时间行只更新提供的节次，其他时间沿用当前课表。增加的新节次必须提供完整起止时间。',
 '午休可写成「午休,11:40,14:00」；也识别课间、晚休和 Lunch Break。休息行不占节次，时间必须落在两节课之间。未单列午休时，会根据前后课时的长间隔显示休息时间。',
 '时间段列支持「08:00-08:45」「08:00 至 08:45」，可替代上课 / 下课时间列；同时填写两种写法时必须一致。',
 '同一节次在多行出现时，其同一边界时间必须一致；时间缺半对、冲突、重叠或倒序会阻止导入，并提示具体行或节次。'
] as const;
export const IMPORT_FORMATS=[{value:'json',label:'JSON',accept:'.json,application/json',extensions:['json']},{value:'csv',label:'CSV',accept:'.csv,text/csv',extensions:['csv']},{value:'excel',label:'Excel（xls / xlsx）',accept:'.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',extensions:['xls','xlsx']}] as const;
export function detectMapping(sheet:Sheet):Mapping{
 const {rows}=sheet;let dayRow=-1,sectionColumn=-1,best=0;
 rows.slice(0,30).forEach((row,i)=>{const count=row.filter(v=>{try{parseDay(v);return true;}catch{return false;}}).length;if(count>best){best=count;dayRow=i;}});
 if(best<2)throw new Error('未识别星期行，请手动指定星期行、节次列与课表区域');
 let countBest=0;
 for(let col=0;col<Math.min(MAX_COLUMNS,Math.max(...rows.map(r=>r.length)));col++){let count=0;rows.slice(dayRow+1).forEach(row=>{try{section(row[col]??'');count++;}catch{/* not a period */}});if(count>countBest){countBest=count;sectionColumn=col;}}
 if(sectionColumn<0)throw new Error('未识别节次列，请手动映射');
 const dayColumns=rows[dayRow].flatMap((v,i)=>{try{parseDay(v);return [i];}catch{return [];}});
 return {dayRow,sectionColumn,firstRow:dayRow+1,lastRow:rows.length-1,firstColumn:Math.min(...dayColumns),lastColumn:Math.max(...dayColumns)};
}

function tableTime(item:Record<string,unknown>,first:number,last:number,single=false):TableTime|undefined{
 const row=Number(item._row);
 let times;try{times=importedTime({startTime:item.startTime,endTime:item.endTime,timeRange:item.timeRange});}catch(e){throw new Error(`第 ${row} 行：${(e as Error).message}`);}
 if(!times){if(single)throw new Error(`第 ${row} 行：上课时间和下课时间必须同时填写`);return;}
 if(single&&first!==last)throw new Error(`第 ${row} 行：独立时间行只能填写一个节次，请逐节提供时间`);
 const {start:from,end:to}=times;
 return {first,last,start:from,end:to,row,single};
}

export function parseSheet(sheet:Sheet,current:Schedule,mapping?:Mapping):ImportResult{
 const rows=sheet.rows.map(row=>row.map(v=>String(v??'').trim()));if(!rows.some(row=>row.some(Boolean)))throw new Error('工作表为空，请选择其他工作表');
 const errors:string[]=[],raw:Record<string,unknown>[]=[],meta:string[]=[],timeRows:TableTime[]=[],rests:RestTime[]=[];
 const addRest=(item:Record<string,unknown>,label:string)=>{try{const times=importedTime({startTime:item.startTime,endTime:item.endTime,timeRange:item.timeRange});if(!times)throw new Error(`${label}缺少开始和结束时间`);rests.push({label,...times});}catch(e){throw new Error(`第 ${item._row} 行：${(e as Error).message}`);}};
 const headerRow=rows.findIndex(row=>{const headers=row.map(v=>headerAliases[v]),weekdays=row.filter(value=>{try{parseDay(value);return true;}catch{return false;}}).length;return headers.includes('name')&&headers.includes('day')||weekdays<2&&(headers.includes('startTime')||headers.includes('endTime')||headers.includes('timeRange'))&&(headers.includes('sections')||headers.includes('start'));});
 if(headerRow>=0&&!mapping){
 const headers=rows[headerRow].map(h=>headerAliases[h]??h);
 for(const key of ['startTime','endTime','timeRange'])if(headers.filter(header=>header===key).length>1)throw new Error(`第 ${headerRow+1} 行：${key==='startTime'?'上课':key==='endTime'?'下课':'时间段'}时间列重复，请只保留一列`);
 rows.slice(headerRow+1).forEach((row,i)=>{
  if(!row.some(Boolean))return;
  const course:Record<string,unknown>={...Object.fromEntries(headers.map((h,j)=>[h,row[j]??''])),_row:headerRow+i+2};
  const label=restLabel(course.sections)||(!course.day?restLabel(course.name):'');if(label){if(course.day)throw new Error(`第 ${course._row} 行：休息时间是每日配置，请清空星期列`);addRest(course,label);return;}
  const timeOnly=!course.name&&!course.day&&(!!course.startTime||!!course.endTime||!!course.timeRange||!headers.includes('name')&&!headers.includes('day'));
  if(course.sections)try{course.sections=section(String(course.sections)).join(',');}catch(e){if(timeOnly||course.startTime||course.endTime||course.timeRange)throw new Error(`第 ${course._row} 行：${(e as Error).message}`);errors.push(`第 ${course._row} 行：${(e as Error).message}`);return;}
  if(timeOnly){let numbers:number[];try{numbers=section(String(course.sections||`${course.start??''}-${course.end||course.start||''}`));}catch(e){throw new Error(`第 ${course._row} 行：${(e as Error).message}`);}timeRows.push(tableTime(course,numbers[0],numbers.at(-1)!,true)!);}
  else raw.push(course);
 });
 }else{
 const m=mapping??detectMapping(sheet);if(Object.values(m).some(v=>!Number.isInteger(v)||v<0)||m.lastRow>=rows.length||m.firstRow>m.lastRow||m.firstColumn>m.lastColumn||m.lastColumn>=MAX_COLUMNS||m.sectionColumn>=MAX_COLUMNS||m.dayRow>=rows.length)throw new Error('映射范围无效');
 const days=new Map<number,number>();for(let c=m.firstColumn;c<=m.lastColumn;c++)try{days.set(c,parseDay(rows[m.dayRow]?.[c]??''));}catch{/* optional non-day columns */}
 if(!days.size)throw new Error('所选星期行中没有可识别的星期');
 const headers=rows[m.dayRow].map(h=>headerAliases[h]),startTimeColumn=headers.indexOf('startTime'),endTimeColumn=headers.indexOf('endTime'),rangeColumn=headers.indexOf('timeRange');
 if(startTimeColumn>=0||endTimeColumn>=0||rangeColumn>=0)for(let r=m.firstRow;r<=m.lastRow;r++){
  const startTime=rows[r]?.[startTimeColumn]??'',endTime=rows[r]?.[endTimeColumn]??'',timeRange=rows[r]?.[rangeColumn]??'';if(!startTime&&!endTime&&!timeRange)continue;
  const label=restLabel(rows[r]?.[m.sectionColumn]);if(label){addRest({_row:r+1,startTime,endTime,timeRange},label);continue;}
  let numbers:number[];try{numbers=section(rows[r]?.[m.sectionColumn]??'');}catch(e){throw new Error(`第 ${r+1} 行：${(e as Error).message}`);}
  timeRows.push(tableTime({_row:r+1,startTime,endTime,timeRange},numbers[0],numbers.at(-1)!,numbers.length===1)!);
 }
 for(let r=m.firstRow;r<=m.lastRow;r++)for(const [c,day] of days){
 if(restLabel(rows[r]?.[m.sectionColumn]))continue;
 const value=rows[r]?.[c]??'';if(!value)continue;
 const merge=sheet.merges.find(range=>r>=range.s.r&&r<=range.e.r&&c>=range.s.c&&c<=range.e.c);
 if(merge&&(r!==merge.s.r||c!==merge.s.c))continue;
 try{if(merge&&merge.e.c!==merge.s.c)throw new Error('课程横跨多个星期，请拆分或核对');
 const start=section(rows[r]?.[m.sectionColumn]??'')[0],end=section(rows[Math.min(merge?.e.r??r,m.lastRow)]?.[m.sectionColumn]??'').at(-1)!;
 const lines=value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),name=lines[0];
 const tagged=(label:string)=>lines.slice(1).find(v=>v.startsWith(label+'：')||v.startsWith(label+':'))?.replace(/^[^:：]+[:：]\s*/,'');
 raw.push({name,day,start,end,teacher:tagged('教师')??tagged('老师')??'',room:tagged('教室')??'',weeks:tagged('周次')||undefined,notes:lines.slice(1).join('\n'),_row:r+1});
 }catch(e){errors.push(`第 ${r+1} 行，列 ${c+1}：${(e as Error).message}`);}
 }
 }
 if(!raw.length&&!timeRows.length&&!rests.length)throw new Error(errors.join('\n')||'没有识别到课程或节次时间，请调整映射');
 // Validate each row against the supported section range before a bad row can resize the whole sheet.
 const validationSchedule={...current,periods:Array.from({length:MAX_PERIODS},(_,i)=>current.periods[i]??{start:'',end:''})};
 const normalized:Course[]=[],validRows:Record<string,unknown>[]=[];
 for(const item of raw){if(item.startTime||item.endTime||item.timeRange)tableTime(item,1,1);const {startTime,endTime,timeRange,...courseItem}=item;let course:Course;try{course=normalizeSchedule({courses:[courseItem]},validationSchedule).courses[0];}catch(e){errors.push(`第 ${item._row} 行：${(e as Error).message}`);continue;}
  const time=tableTime(item,course.start,course.end);if(time)timeRows.push(time);normalized.push(course);validRows.push(courseItem);
 }
 if(raw.length&&!normalized.length||!normalized.length&&!timeRows.length&&!rests.length)throw new Error(errors.join('\n')||'没有有效课程或节次时间');
 const periods=applyRestTimes(applyPeriodTimes(current,normalized,timeRows,meta),rests);
 if(rests.length)meta.push(`已读取休息时间：${rests.map(rest=>`${rest.label} ${rest.start}–${rest.end}`).join('、')}，不占课程节数。`);
 const schedule=normalizeSchedule({term:current.term,periods,...(raw.length?{courses:validRows}:{})},current);
 if(errors.length)meta.push(`成功识别 ${normalized.length} 个课程块，跳过 ${errors.length} 个项目；请核对错误明细。`);
 schedule.importNotes=[...new Set([...(schedule.importNotes??[]),...meta])];
 return {schedule,errors,blocks:normalized.length,days:[...new Set(normalized.map(c=>c.day))].sort()};
}
export function parseFileSource(source:FileSource,current:Schedule,sheetIndex=0,mapping?:Mapping):ImportResult{
 if(source.format==='json')return parseJSONPreview(source.json??'',current);
 const sheet=source.sheets[sheetIndex];if(!sheet)throw new Error('请选择工作表');return parseSheet(sheet,current,mapping);
}

/** Strict parsing remains available for legacy callers. Preview parsing reports bad rows explicitly. */
export function parseJSONPreview(text:string,current:Schedule):ImportResult{
 try{const schedule=parseImport(text,'json',current);return {schedule,errors:[],blocks:schedule.courses.length,days:[...new Set(schedule.courses.map(c=>c.day))].sort()};}
 catch(original){
  let raw:unknown;try{raw=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw original;}
  const root=(Array.isArray(raw)?{courses:raw}:raw) as Record<string,unknown>;
  if(!root||typeof root!=='object')throw original;
  const wrap=root.schedule??root.data??root.result;
  const data=wrap&&typeof wrap==='object'?{...root,...(Array.isArray(wrap)?{courses:wrap}:wrap)}:root;
  // The flattened course list must remain authoritative when normalizing individual rows.
  delete data.schedule;delete data.data;delete data.result;
  const courses=data.courses??data.lessons??data.items??data.list;if(!Array.isArray(courses)||!courses.length||courses.length>2000)throw original;
  const valid:unknown[]=[],errors:string[]=[];
  courses.forEach((course,i)=>{try{normalizeSchedule({...data,courses:[course]},current);valid.push(course);}catch(e){errors.push(`第 ${i+1} 条：${(e as Error).message}`);}});
  if(!valid.length)throw original;
  const schedule=normalizeSchedule({...data,courses:valid},current);
  schedule.importNotes=[...(schedule.importNotes??[]),`成功识别 ${valid.length} 个课程块，跳过 ${errors.length} 个项目。`,...errors];
  return {schedule,errors,blocks:valid.length,days:[...new Set(schedule.courses.map(c=>c.day))].sort()};
 }
}
