import {useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {JSON_PROMPT,parseImport} from '../lib/import';
import {copyText} from '../lib/native';
import {coursePeriod,sampleSchedule,type Schedule} from '../lib/model';
import {Dialog} from '../components/Dialog';
import {Icon} from '../components/Icon';
import {CalendarPicker} from '../components/CalendarPicker';
import {PageLeaveGuard} from '../components/PageLeaveGuard';
export function Import({done}:{done:()=>void}){
  const {data,update,toast}=useApp(),[text,setText]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState<Schedule|null>(null),[tutorial,setTutorial]=useState(false),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[school,setSchool]=useState(data.settings.school);
  const [dateOpen,setDateOpen]=useState(false),[reading,setReading]=useState(false),[source,setSource]=useState('');
  const committed=useRef(false),saving=useRef(false),readingFile=useRef(false);
  function parse(value:string){try{setError('');setPreview(parseImport(value,'json',data.schedule));}catch(e){setError(`请提供有效的 JSON 课表：${(e as Error).message}`);}}
  async function read(file:File|undefined){
    if(!file||readingFile.current||saving.current)return;if(!/\.json$/i.test(file.name)){setError('只支持 .json 课表文件；请先转换为 JSON');return;}if(file.size>5_000_000){setError('文件超过 5 MB，请精简后导入');return;}readingFile.current=true;setReading(true);
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      const head=new TextDecoder('ascii').decode(bytes.subarray(0,2048));
      const charset=head.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
      let encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':charset==='gbk'||charset==='gb2312'||charset==='gb18030'?'gb18030':'utf-8';
      let content:string;
      try{content=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{encoding='gb18030';content=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
      setSource(file.name);parse(content.replace(/^\uFEFF/,''));
    }catch(e){setError(`文件读取失败：${(e as Error).message}`);}finally{readingFile.current=false;setReading(false);}
  }
  async function commit(){if(!preview||saving.current)return;saving.current=true;setBusy(true);try{const validated=parseImport(JSON.stringify(preview),'json',data.schedule);await update(s=>({...s,schedule:validated,settings:{...s.settings,school:school.trim()},onboarded:true}));committed.current=true;toast(`已导入 ${validated.courses.length} 门课程，主页已同步`);setPreview(null);requestAnimationFrame(done);}catch(e){setError(`保存未完成：${(e as Error).message}`);}finally{saving.current=false;setBusy(false);}}
  return <>
    <p className="page-purpose">粘贴内容 → 检查课程与开学日期 → 确认导入。</p>
    <div className="import-hero import-paste import-workspace">
      <div className="import-heading"><span className="feature-icon"><Icon name="upload" size={23}/></span><div><h2>粘贴 JSON 课表</h2><p>解析后先预览，确认前不会替换当前课表。</p></div></div>
      <label className="field">JSON 课表内容
        <textarea aria-label="课表内容" rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={'{"term":{"startDate":"2026-09-01"},"courses":[{"name":"课程名","room":"16栋203号教室","day":1,"start":1,"end":2,"weeks":[1,2]}]}'} value={text} onChange={e=>{setText(e.target.value);setSource('');}}/>
      </label>
      <button className="primary full" disabled={reading||busy} onClick={()=>parse(text)}>解析并预览</button>
    </div>
    <div className="import-file-option">
      <div><strong>已有 JSON 文件？</strong><p>选择 .json 文件，检查预览后再导入。</p></div>
      <label className={`secondary file-button import-file-button ${reading?'is-disabled':''}`}><Icon name="upload" size={17}/>{reading?'正在读取…':'选择 JSON'}<input type="file" aria-label="选择 JSON 文件" accept=".json,application/json" disabled={reading||busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>
    <md-card className="form-card import-help"><h3>只有截图或教务页面？</h3><p className="muted">先用转换提示词整理为 JSON，再粘贴到上方。</p><button className="secondary full" onClick={()=>setPrompt(JSON_PROMPT)}><Icon name="copy" size={17}/>复制 JSON 转换提示词</button><div className="button-row"><button className="text-button" onClick={()=>setTutorial(true)}>查看导入教程</button><button className="text-button" onClick={()=>setPreview(sampleSchedule())}>体验示例课表</button></div></md-card>
    <p className="hint import-local-note"><Icon name="shield" size={15}/>课表只在本机解析。使用外部工具转换时，请自行确认分享的内容。</p>
  <Dialog open={!!error} title="未能导入" onClose={()=>setError('')}><p role="alert">{error}</p><p className="muted">原课表保留不变，请修正后再试。</p><button className="primary full" onClick={()=>setError('')}>知道了</button></Dialog>
  <Dialog open={!!preview} title="确认这份课表" onClose={()=>{if(!saving.current)setPreview(null);}}>{preview&&<><div className="import-preview-summary"><strong>{preview.term.name}</strong><span>{preview.courses.length} 门课程 · {preview.term.weeks} 周{source&&` · ${source}`}</span></div><div className="field"><span id="import-date-label">确认开学日期</span><button className="term-date-trigger" aria-labelledby="import-date-label import-date-value" aria-haspopup="dialog" onClick={()=>setDateOpen(true)}><span id="import-date-value">{preview.term.startDate.replaceAll('-','/')}</span><Icon name="calendar" size={18}/></button></div><label className="field">学校名称（导航到楼栋时使用）<input placeholder="例如：某某大学某某校区" value={school} onChange={e=>setSchool(e.target.value)}/></label>{!school.trim()&&<p className="hint">未填写也能导入课表；首次导航前需要补填学校名称。</p>}{preview.importNotes?.map(note=><p className="import-notice" key={note}>{note}</p>)}<div className="preview-list">{preview.courses.slice(0,8).map(c=><p key={c.id}>{c.name}<small>周{'一二三四五六日'[c.day-1]} · {coursePeriod(c,preview)} · {c.room||'教室待填'}</small></p>)}</div>{preview.courses.length>8&&<p className="hint">此处预览前 8 门；确认后会导入全部 {preview.courses.length} 门课程。</p>}<p className="muted">{data.schedule.courses.length?`确认后替换当前 ${data.schedule.courses.length} 门课程，已保存的教材保留。`:'确认后，课程会显示在主页和搜索中。'}开学日期以此处确认值为准；第 1 周按该日期所在周的周一计算。</p><button className="primary full" disabled={busy} onClick={()=>void commit()}>{busy?'正在保存…':'确认导入'}</button><button className="secondary full" disabled={busy} onClick={()=>setPreview(null)}>返回修改</button></>}</Dialog>
  {dateOpen&&preview&&<CalendarPicker selected={preview.term.startDate} schedule={preview} purpose="import" onSelect={startDate=>{setPreview(p=>p?{...p,term:{...p.term,startDate}}:p);setDateOpen(false);}} onClose={()=>setDateOpen(false)}/>}
  <PageLeaveGuard dirty={()=>!committed.current&&!!text.trim()} busy={busy||reading} discard={()=>setText('')}/>
  <Dialog open={!!prompt} title="复制给 AI 的提示词" onClose={()=>setPrompt('')}><textarea className="prompt-text" readOnly value={prompt} rows={10}/><button className="primary full" onClick={()=>void copyText(prompt).then(()=>toast('提示词已复制')).catch(e=>toast(e.message))}>复制提示词</button></Dialog>
  <Dialog open={tutorial} title="三步，拥有自己的课表" onClose={()=>setTutorial(false)}><p>选择 JSON 文件，或把 JSON 粘贴到上方文本框。截图和教务页面请先在外部转换成 JSON。</p><p>检查课程名、星期、节次、周次和楼栋教室。单双周请明确写出；不确定的教师或教室可以留空。</p><p>先设置正确的学期开始日期，再预览导入。确认后，主页立即显示新课程。点击课程可查看教师、教室和教材。</p><button className="primary full" onClick={()=>setTutorial(false)}>开始导入</button></Dialog></>;
}
