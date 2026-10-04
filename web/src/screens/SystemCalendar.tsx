import {useEffect,useRef,useState} from 'react';
import {Dialog} from '../components/Dialog';
import {Icon} from '../components/Icon';
import {isNative,native,type NativeMessage} from '../lib/native';
import {useApp} from '../state/AppState';
import {normalizeRoom} from '../lib/import';

export function SystemCalendar(){
  const {data}=useApp();
  const [confirm,setConfirm]=useState<'import'|'clear'|'restore'|null>(null);
  const [canRestore,setCanRestore]=useState(false);
  const [busy,setBusy]=useState(false),[imported,setImported]=useState<number|null>(null);
  const running=useRef(false);
  const [result,setResult]=useState<{message:string;success:boolean}|null>(null);
  const android=isNative();
  const courses=data.schedule.courses;
  const total=courses.reduce((sum,course)=>sum+course.weeks.length,0);
  useEffect(()=>{
    function receive(event:Event){
      const response=(event as CustomEvent<NativeMessage>).detail;
      if(response.action==='calendarStatus'){running.current=!!response.busy;setBusy(!!response.busy);}
      else {running.current=false;setBusy(false);setResult({message:response.message??'操作完成',success:!!response.success});}
      if(response.permission&&response.count!==undefined)setImported(response.count);
      setCanRestore(!!response.canRestore);
    }
    window.addEventListener('dolphin-calendar',receive);
    if(android)native('calendarStatus');
    return()=>window.removeEventListener('dolphin-calendar',receive);
  },[android]);
  function run(){
    if(running.current||!confirm)return;running.current=true;
    const action=confirm==='import'?'calendarSync':confirm==='restore'?'calendarRestore':'calendarClear';
    setConfirm(null);setBusy(true);setResult(null);
    native(action,action==='calendarSync'?{schedule:{...data.schedule,courses:courses.map(course=>({...course,room:normalizeRoom(course.room).room}))}}:{});
  }
  return <>
    <md-card className="form-card calendar-summary">
      <span className="calendar-symbol"><Icon name="calendar" size={30}/></span>
      <h3>课程，放进你的日历</h3>
      <p>按开学日期与周次，把每次上课的时间、教室和教师导入手机日历。每条日程注明“由 Dolphin Calendar 创建”。</p>
      <div className="calendar-count"><strong>{courses.length} 门课程</strong><span>{total} 次上课</span></div>
      <p className="hint">包括整个学期或学年的课程。未填写有效上课时间的节次无法写入，导入结果会提示数量。</p>
      <button className="primary full" disabled={!android||!total||busy} onClick={()=>setConfirm('import')}><Icon name="calendar" size={19}/>{busy?'正在处理…':'导入到系统日历'}</button>
      {!total&&<p className="hint">先导入课表或添加课程，再写入系统日历。</p>}
      {!android&&<p className="hint">请在 Android 安装版中使用，网页无法直接写入手机日历。</p>}
      {android&&imported!==null&&<p className="calendar-status">Dolphin 课程日历中已有 {imported} 次上课</p>}
      {result&&<p className={`calendar-result${result.success?'':' error'}`} role={result.success?'status':'alert'}>{result.message}</p>}
    </md-card>
    <md-card className="form-card">
      <h3>随时查看和更新</h3>
      <p className="muted">只在导入时申请日历权限。再次导入会更新 Dolphin 课程日历；修改课表后，重新导入即可。</p>
      <button className="secondary full" disabled={!android||busy} onClick={()=>native('calendarOpen')}><Icon name="calendar" size={19}/>打开系统日历</button>
      <button className="secondary full" disabled={!android||busy||!canRestore} onClick={()=>setConfirm('restore')}>复原到导入前</button>
      <p className="hint">复原会撤销最近一次导入；首次导入时，移除本次创建的课程。只保留一份复原副本。</p>
      <button className="text-button danger full" disabled={!android||busy} onClick={()=>setConfirm('clear')}>清除已导入的课程</button>
      <p className="hint">课程写入专用的本地日历，不会自动上传。清除仅影响 Dolphin 创建的课程日历。</p>
    </md-card>
    <Dialog open={!!confirm} title={confirm==='import'?'导入到系统日历？':confirm==='restore'?'复原到导入前？':'清除已导入的课程？'} onClose={()=>setConfirm(null)}>
      <p>{confirm==='import'?`将 ${courses.length} 门课程、${total} 次上课按实际日期导入。已有的 Dolphin 课程副本会被替换。`:confirm==='restore'?'撤销最近一次导入，恢复导入前的 Dolphin 课程日历。':'将移除 Dolphin 课程日历及其中的课程，包括复原副本。'}</p>
      <button className="primary full" onClick={run}>{confirm==='import'?'确认导入':confirm==='restore'?'确认复原':'确认清除'}</button>
      <button className="secondary full" onClick={()=>setConfirm(null)}>取消</button>
    </Dialog>
  </>;
}
