import {useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {JSON_PROMPT,parseImport} from '../lib/import';
import {copyText,isNative,native} from '../lib/native';
import {coursePeriod,sampleSchedule,type Schedule} from '../lib/model';
import {Dialog} from '../components/Dialog';
import {Icon} from '../components/Icon';
import {CalendarPicker} from '../components/CalendarPicker';
import {parseJSONPreview,IMPORT_FORMATS,CSV_FIELDS,UNIFIED_CSV_TEMPLATE,UNIFIED_JSON_TEMPLATE,UNIFIED_IMPORT_NOTES} from '../lib/fileImport';
import {FileImport} from '../components/FileImport';
import {PageLeaveGuard} from '../components/PageLeaveGuard';
import {ImportSteps} from '../components/ImportSteps';
import {exportText} from '../lib/export';
import {coursesConflict,periodRest} from '../lib/scheduleTime';
export function Import({done}:{done:()=>void}){
  const {data,update,toast}=useApp(),[text,setText]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState<Schedule|null>(null),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null),[format,setFormat]=useState('json'),[stage,setStage]=useState(0),[formatHelp,setFormatHelp]=useState(false);

  const [dateOpen,setDateOpen]=useState(false),[source,setSource]=useState('');
  const committed=useRef(false),saving=useRef(false),fileInput=useRef<HTMLInputElement>(null);
  function returnToFile(){if(saving.current)return;setPreview(null);setDateOpen(false);setStage(file?2:0);}
  function chooseAgain(){setFile(null);setStage(0);requestAnimationFrame(()=>fileInput.current?.click());}
  function parse(value:string){try{setError('');setStage(2);setFormat('json');setFile(null);setPreview(parseJSONPreview(value,data.schedule).schedule);setStage(3);}catch(e){setError(`请提供有效的 JSON 课表：${(e as Error).message}`);}}
  function read(file:File|undefined){if(file){setFile(file);setStage(1);}}
  async function commit(){if(!preview||saving.current)return;saving.current=true;setBusy(true);setStage(4);try{const validated=parseImport(JSON.stringify(preview),'json',data.schedule,{allowEmpty:true,preserveCourseIds:true});await update(s=>({...s,schedule:validated,onboarded:true}));committed.current=true;toast(`已导入 ${validated.courses.length} 门课程，主页已同步`);setPreview(null);setFile(null);requestAnimationFrame(done);}catch(e){setStage(3);setError(`保存未完成：${(e as Error).message}`);}finally{saving.current=false;setBusy(false);}}
  return <>
    <ImportSteps stage={stage}/>
    <div className="import-file-option"><div><strong>选择课表文件</strong><p>JSON · CSV · Excel（xls / xlsx）<br/>自动识别格式与上课、下课、午休时间，预览后确认。</p></div><label className={`primary file-button import-file-button ${busy?'is-disabled':''}`}><Icon name="upload" size={17}/>选择文件<input ref={fileInput} type="file" aria-label="选择课表文件" accept={IMPORT_FORMATS.map(option=>option.accept).join(',')} disabled={busy} onChange={e=>{read(e.target.files?.[0]);e.target.value='';}}/></label></div>
    {file&&<FileImport key={file.name+file.lastModified} file={file} open={!preview} onChooseFile={chooseAgain} onStage={setStage} onClose={()=>{setFile(null);setStage(0);}} onPreview={(schedule,name,type)=>{setPreview(schedule);setSource(name);setFormat(type);setStage(3);}}/>}
    <details className="import-paste-option"><summary>粘贴 JSON 内容</summary>
    <div className="import-hero import-paste import-workspace">
      <div className="import-heading"><span className="feature-icon"><Icon name="upload" size={23}/></span><div><h2>粘贴 JSON 课表</h2><p>解析后先预览，确认前不会替换当前课表。</p></div></div>
      <label className="field">JSON 课表内容
        <textarea aria-label="课表内容" rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="粘贴 AI 返回的完整 JSON，包含 term、periods 和 courses。" value={text} onChange={e=>{setText(e.target.value);setSource('');}}/>
      </label>
      <button className="primary full" disabled={busy} onClick={()=>parse(text)}>解析并预览</button>
    </div>
    </details><details className="import-format-help"><summary>完整课表模板与格式说明</summary><p>一份文件同时填写课程、每节上课 / 下课时间与午休。单节和连堂都支持；示例资料请替换为自己的实际课表，预览后再确认。</p><div className="button-row"><button className="secondary" onClick={()=>setFormatHelp(true)}>查看格式说明</button><button className="secondary" onClick={()=>exportText('dolphin-calendar-complete.csv',UNIFIED_CSV_TEMPLATE,'text/csv')}>CSV 完整课表模板</button><button className="secondary" onClick={()=>exportText('dolphin-calendar-complete.json',UNIFIED_JSON_TEMPLATE)}>JSON 完整课表模板</button></div></details>
    <md-card className="form-card import-help"><h3>只有截图或教务页面？</h3><p className="muted">把课程表、完整逐节作息和学期资料一起交给 AI，整理成一份 JSON。只有连堂总时段时，请补齐每一节的实际时间；缺失信息先核对，再导入。</p><button className="secondary full" onClick={()=>setPrompt(JSON_PROMPT)}><Icon name="copy" size={17}/>向 AI 输入提示词导入课表</button><button className="text-button" onClick={()=>{setPreview(sampleSchedule());setFormat('json');setStage(3);}}>体验示例课表</button></md-card>
    <p className="hint import-local-note"><Icon name="shield" size={15}/>课表只在本机解析。使用外部工具转换时，请自行确认分享的内容。</p>
  <Dialog open={!!error} title="未能导入" onClose={()=>setError('')}><p role="alert">{error}</p><p className="muted">原课表保留不变，请修正后再试。</p><button className="primary full" onClick={()=>setError('')}>知道了</button></Dialog>
  <Dialog open={!!preview} title="确认这份课表" onClose={returnToFile}>{preview&&<><ImportSteps stage={stage}/><div className="import-preview-summary"><strong>{preview.term.name}</strong><span>{preview.courses.length} 个课程块 · {preview.periods.length} 节 · {preview.term.weeks} 周{source&&` · ${source}`}</span></div><div className="field"><span id="import-date-label">确认开学日期</span><button className="term-date-trigger" aria-labelledby="import-date-label import-date-value" aria-haspopup="dialog" onClick={()=>setDateOpen(true)}><span id="import-date-value">{preview.term.startDate.replaceAll('-','/')}</span><Icon name="calendar" size={18}/></button></div><ImportChanges before={data.schedule} after={preview} format={format}/>{preview.importNotes?.map(note=><p className="import-notice" key={note}>{note}</p>)}<details className="import-times"><summary>上课时间（{preview.periods.length} 节）</summary>{preview.periods.map((period,i)=><div key={i}><p><span>第 {i+1} 节</span><span>{period.start}–{period.end}</span></p>{periodRest(preview.periods,i)&&<p className="import-rest"><span>{periodRest(preview.periods,i)!.label}</span><span>{periodRest(preview.periods,i)!.start}–{periodRest(preview.periods,i)!.end}</span></p>}</div>)}</details>{previewConflicts(preview).map(pair=><p key={pair} className="import-notice">课程冲突：{pair}（确认后同时保留）</p>)}<div className="preview-list">{preview.courses.slice(0,8).map(c=><p key={c.id}>{c.name}<small>周{'一二三四五六日'[c.day-1]} · {coursePeriod(c,preview)} · {c.room||'教室待填'}</small></p>)}</div>{preview.courses.length>8&&<p className="hint">此处预览前 8 门；确认后会导入全部 {preview.courses.length} 门课程。</p>}<p className="muted">{preview.importNotes?.some(note=>note.startsWith('文件仅更新课表配置'))?'确认后仅更新课表配置，已有课程和教材保留。':data.schedule.courses.length?`确认后替换当前 ${data.schedule.courses.length} 门课程，已保存的教材保留。`:'确认后，课程会显示在主页和搜索中。'}开学日期以此处确认值为准；第 1 周按该日期所在周的周一计算。</p><div className="import-preview-actions"><button className="secondary" disabled={busy} onClick={returnToFile}>返回修改</button><button className="primary" disabled={busy} onClick={()=>void commit()}>{busy?'正在保存…':'确认导入'}</button></div></>}</Dialog>
  {dateOpen&&preview&&<CalendarPicker selected={preview.term.startDate} schedule={preview} purpose="import" onSelect={startDate=>{setPreview(p=>p?{...p,term:{...p.term,startDate}}:p);setDateOpen(false);}} onClose={()=>setDateOpen(false)}/>}
  <Dialog open={formatHelp} title="完整课表格式说明" onClose={()=>setFormatHelp(false)}><div className="format-notes">{UNIFIED_IMPORT_NOTES.map(note=><p key={note}>{note}</p>)}<h3>CSV 完整课表示例</h3><pre>{UNIFIED_CSV_TEMPLATE}</pre><h3>JSON 完整课表示例</h3><pre>{UNIFIED_JSON_TEMPLATE}</pre><details><summary>CSV 字段与旧格式兼容说明</summary><p>以下必填项针对课程行；逐节作息行请按上方说明，课程名与星期留空。</p>{CSV_FIELDS.map(field=><p key={field.key}><strong>{field.label}</strong>（{field.aliases.join(' / ')}）<br/>{field.description}</p>)}</details></div><button className="primary full" onClick={()=>setFormatHelp(false)}>知道了</button></Dialog>
  <PageLeaveGuard dirty={()=>!committed.current&&!!text.trim()} busy={busy} discard={()=>setText('')}/>
  <Dialog open={!!prompt} title="复制给 AI 的提示词" onClose={()=>setPrompt('')}><p className="muted">复制提示词后，连同课程表、全部单节作息、实际周次和开学日期发送给 AI。资料不齐时先回答 AI 的问题，核对完整 JSON 后再导入。</p><textarea className="prompt-text" aria-label="AI 完整课表提示词" readOnly value={prompt} rows={10}/><button className="primary full" onClick={()=>void copyText(prompt).then(()=>toast('提示词已复制')).catch(e=>toast(e.message))}>复制提示词</button><a className="secondary full" href="https://tequed232.github.io/Dolphin-Calendar/import-guide/" target="_blank" rel="noopener noreferrer" onClick={event=>{if(isNative()){event.preventDefault();native('openExternal',{url:'https://tequed232.github.io/Dolphin-Calendar/import-guide/'});}}}>打开图文与视频教程</a></Dialog></>;
}

function previewConflicts(schedule:Schedule){const result:string[]=[];for(let i=0;i<schedule.courses.length;i++)for(let j=i+1;j<schedule.courses.length;j++)if(coursesConflict(schedule.courses[i],schedule.courses[j],schedule.term.startDate)){result.push(`${schedule.courses[i].name} / ${schedule.courses[j].name}`);if(result.length===20)return result;}return result;}

function ImportChanges({before,after,format}:{before:Schedule;after:Schedule;format:string}){
 const onlyConfig=after.importNotes?.some(note=>note.startsWith('文件仅更新课表配置'));
 const modified:string[]=[],retained:string[]=['教材、背景和应用偏好'];
 (onlyConfig?retained:modified).push(onlyConfig?'原有课程':`课程：${before.courses.length} → ${after.courses.length} 个课程块（替换当前课程）`);
 for(const [name,old,next] of [['课表名称',before.term.name,after.term.name],['开学日期',before.term.startDate,after.term.startDate],['学期周数',before.term.weeks,after.term.weeks],['每日节数',before.periods.length,after.periods.length]] as const)(old===next?retained:modified).push(old===next?`${name}：${next}`:`${name}：${old} → ${next}`);
 (JSON.stringify(before.periods)===JSON.stringify(after.periods)?retained:modified).push('每节上课 / 下课时间与午休');
 return <div className="import-changes"><p className="hint">{format==='json'?'JSON：恢复文件提供的课程与课表配置；缺少的配置保留原值。':'CSV / Excel：读取课程和提供的上课时间；缺少的学期配置沿用当前课表，完整时间表决定每日节数。'}</p><h3>将修改</h3>{modified.length?modified.map(value=><p key={value}>{value}</p>):<p>无配置变更</p>}<h3>将保留</h3>{retained.map(value=><p key={value}>{value}</p>)}</div>;
}
