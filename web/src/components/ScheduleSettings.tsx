import {useEffect,useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {Dialog} from './Dialog';
import {PageLeaveGuard} from './PageLeaveGuard';
import {CalendarPicker} from './CalendarPicker';
import {Icon} from './Icon';
import {generatePeriods,resizePeriods,validatePeriods,validDate,periodRest,retainRestTimes} from '../lib/scheduleTime';
export function ScheduleSettings({timesOnly=false,openTimes}:{timesOnly?:boolean;openTimes?:()=>void}){
 const {data,update,toast}=useApp();const {schedule}=data;
 const [term,setTerm]=useState(schedule.term),[periods,setPeriods]=useState(schedule.periods),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reduce,setReduce]=useState<number|null>(null),[auto,setAuto]=useState(false),[dateOpen,setDateOpen]=useState(false),[first,setFirst]=useState(schedule.periods[0]?.start??'08:00'),[duration,setDuration]=useState(45),[breakTime,setBreakTime]=useState(10);
 const baseline=useRef({term:schedule.term,periods:schedule.periods}),lock=useRef(false);
 const dirty=()=>JSON.stringify({term,periods})!==JSON.stringify(baseline.current);
 useEffect(()=>{baseline.current={term:schedule.term,periods:schedule.periods};setTerm(schedule.term);setPeriods(schedule.periods);setFirst(schedule.periods[0]?.start??'08:00');setError('');},[schedule.term,schedule.periods]);
 function resize(count:number){try{const affected=schedule.courses.filter(c=>c.end>count);if(count<periods.length&&affected.length){setReduce(count);return;}setPeriods(resizePeriods(periods,count));setError('');}catch(e){setError((e as Error).message);}}
 async function save(){if(lock.current)return false;lock.current=true;setBusy(true);try{
  if(!validDate(term.startDate))throw new Error('开学日期无效');if(!Number.isInteger(term.weeks)||term.weeks<1||term.weeks>999)throw new Error('学期周数应为 1–999');validatePeriods(periods);
  await update(s=>({...s,schedule:{...s.schedule,term,periods}}));baseline.current={term,periods};toast('课表设置已保存，主页已同步');setError('');return true;
 }catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}}
 function discard(){setTerm(baseline.current.term);setPeriods(baseline.current.periods);setError('');}
 const affected=schedule.courses.filter(c=>reduce!==null&&c.end>reduce);
 return <div className="compact-settings">
  <PageLeaveGuard dirty={dirty} save={save} discard={discard} busy={busy}/>
  {!timesOnly&&<md-card className="form-card"><label className="field">课表名称<input value={term.name} onChange={e=>setTerm(t=>({...t,name:e.target.value}))}/></label><div className="term-fields"><div className="field term-start"><span>开学日期</span><button className="term-date-trigger" aria-label="开学日期" aria-haspopup="dialog" onClick={()=>setDateOpen(true)}><span>{term.startDate.replaceAll('-','/')}</span><Icon name="calendar" size={18}/></button></div><label className="field term-weeks">学期周数<input type="number" min={1} max={999} value={term.weeks} onChange={e=>setTerm(t=>({...t,weeks:Number(e.target.value)}))}/></label></div><label className="setting-row"><strong>课程节数</strong><select aria-label="课程节数" value={periods.length} onChange={e=>resize(Number(e.target.value))}>{Array.from({length:24},(_,i)=><option key={i} value={i+1}>{i+1} 节</option>)}</select></label>{openTimes&&<button className="setting-row link-row" onClick={openTimes}><strong>上课时间</strong><span>{periods.length} 节 ›</span></button>}</md-card>}
  {(timesOnly||!openTimes)&&<md-card className="form-card time-list"><button className="setting-row link-row" onClick={()=>setAuto(true)}><strong>自动顺延后续课程</strong><span>设置 ›</span></button>{periods.map((period,i)=><div key={i}><div className="period-editor"><span>第 {i+1} 节</span><input type="time" aria-label={`第${i+1}节开始`} value={period.start} onChange={e=>setPeriods(a=>retainRestTimes(a.map((p,j)=>j===i?{...p,start:e.target.value}:p)))}/><span>—</span><input type="time" aria-label={`第${i+1}节结束`} value={period.end} onChange={e=>setPeriods(a=>retainRestTimes(a.map((p,j)=>j===i?{...p,end:e.target.value}:p)))}/></div>{periodRest(periods,i)&&<p className="period-rest">{periodRest(periods,i)!.label} · {periodRest(periods,i)!.start}–{periodRest(periods,i)!.end}</p>}</div>)}</md-card>}
  {error&&<p role="alert" className="field-error">{error}</p>}<button className="primary full" disabled={busy||!dirty()} onClick={()=>void save()}>{busy?'保存中…':'保存课表设置'}</button>
  {dateOpen&&<CalendarPicker selected={term.startDate} schedule={{...schedule,term,periods}} purpose="term" onSelect={startDate=>{setTerm(old=>({...old,startDate}));setDateOpen(false);}} onClose={()=>setDateOpen(false)}/>}
  <Dialog open={reduce!==null} title="减少课程节数？" onClose={()=>setReduce(null)}><p>第 {(reduce??0)+1}～{periods.length} 节仍存在课程，是否继续减少课程节数？</p><p className="hint">{affected.map(c=>c.name).join('、')}会保留，超出范围的课程暂不显示或提醒。增加节数后恢复，也可先编辑课程。</p><div className="button-row"><button className="secondary" onClick={()=>setReduce(null)}>取消</button><button className="primary" onClick={()=>{if(reduce!==null)setPeriods(resizePeriods(periods,reduce));setReduce(null);}}>继续减少</button></div></Dialog>
  <Dialog open={auto} title="自动顺延" onClose={()=>setAuto(false)}><label className="field">第一节开始时间<input type="time" value={first} onChange={e=>setFirst(e.target.value)}/></label><div className="form-grid"><label className="field">每节课时长（分钟）<input type="number" min={1} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><label className="field">课间（分钟）<input type="number" min={0} value={breakTime} onChange={e=>setBreakTime(Number(e.target.value))}/></label></div><button className="primary full" onClick={()=>{try{setPeriods(generatePeriods(periods.length,first,duration,breakTime));setAuto(false);setError('');}catch(e){setError((e as Error).message);}}}>应用到 {periods.length} 节</button>{error&&<p role="alert" className="field-error">{error}</p>}</Dialog>
 </div>;
}
