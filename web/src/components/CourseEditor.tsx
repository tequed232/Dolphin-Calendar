import {useId,useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {compactWeeks,PALETTE,type Course} from '../lib/model';
import {parseNumbers} from '../lib/import';
import {useDiscardGuard} from '../lib/useDiscardGuard';
import {Dialog} from './Dialog';
import {ChoiceSelect} from './ChoiceSelect';
import {UnsavedChanges} from './UnsavedChanges';

type Errors={name?:string;periods?:string;weeks?:string;save?:string};
export function CourseEditor({course,onClose}:{course:Course|null;onClose:()=>void}){
  const {data,update,toast}=useApp();
  const [initial]=useState<Course>(()=>course??{id:crypto.randomUUID(),name:'',teacher:'',room:'',day:1,start:1,end:Math.min(2,data.schedule.periods.length),weeks:Array.from({length:data.schedule.term.weeks},(_,i)=>i+1),color:'sage',notes:''});
  const [draft,setDraft]=useState(initial),[weeks,setWeeks]=useState(compactWeeks(initial.weeks)),[errors,setErrors]=useState<Errors>({}),[confirmDelete,setConfirmDelete]=useState(false),[busy,setBusy]=useState(false);
  const lock=useRef(false),nameInput=useRef<HTMLInputElement>(null),weeksInput=useRef<HTMLInputElement>(null),periodFields=useRef<HTMLDivElement>(null),id=useId();
  const dirty=JSON.stringify(draft)!==JSON.stringify(initial)||weeks!==compactWeeks(initial.weeks),guard=useDiscardGuard(dirty,onClose,busy);
  function patch(key:keyof Course,value:string|number){setDraft(d=>({...d,[key]:value}));setErrors(current=>({...current,[key==='start'||key==='end'?'periods':key]:undefined,save:undefined}));}
  async function save(){
    if(lock.current)return false;
    const next:Errors={};let parsed:number[]=[];
    if(!draft.name.trim())next.name='请填写课程名称，例如“大学英语”。';
    if(!Number.isInteger(draft.start)||!Number.isInteger(draft.end)||draft.start<1||draft.end>data.schedule.periods.length)next.periods='请选择当前课表中的上课节次。';
    else if(draft.start>draft.end)next.periods='开始节次不能晚于结束节次，请调整其中一项。';
    try{parsed=parseNumbers(weeks,data.schedule.term.weeks,'周次');}catch(e){next.weeks=(e as Error).message;}
    setErrors(next);
    if(Object.keys(next).length){
      if(next.name)nameInput.current?.focus();else if(next.periods)periodFields.current?.querySelector<HTMLButtonElement>('button')?.focus();else weeksInput.current?.focus();
      return false;
    }
    lock.current=true;setBusy(true);
    try{
      await update(s=>{
        const name=draft.name.trim(),courses=[...s.schedule.courses.filter(c=>c.id!==draft.id),{...draft,name,weeks:parsed}];
        let books=s.books;
        if(course&&course.name!==name&&s.books[course.name]&&!s.books[name]){
          books={...s.books,[name]:s.books[course.name]};
          if(!courses.some(item=>item.name===course.name))delete books[course.name];
        }
        return {...s,books,schedule:{...s.schedule,courses}};
      });
      toast('课程已保存');onClose();return true;
    }catch(e){setErrors({save:`保存未完成：${(e as Error).message}。修改仍在这里，请重试。`});return false;}
    finally{lock.current=false;setBusy(false);}
  }
  async function remove(){
    if(lock.current)return;lock.current=true;setBusy(true);
    try{await update(s=>({...s,schedule:{...s.schedule,courses:s.schedule.courses.filter(c=>c.id!==draft.id)}}));toast('课程已删除');onClose();}
    catch(e){setErrors({save:`删除未完成：${(e as Error).message}。请重试。`});setConfirmDelete(false);}
    finally{lock.current=false;setBusy(false);}
  }
  const periodChoices=data.schedule.periods.map((period,index)=>({value:index+1,label:`第 ${period.label??index+1} 节`}));
  return <><Dialog open title={course?'编辑课程':'添加课程'} onClose={guard.requestClose}>
    <form onSubmit={e=>{e.preventDefault();void save();}} noValidate aria-busy={busy}>
    <fieldset className="editor-fields" disabled={busy}>
    <label className="field">课程名<input ref={nameInput} value={draft.name} onChange={e=>patch('name',e.target.value)} placeholder="例如 大学英语" aria-invalid={!!errors.name} aria-describedby={errors.name?`${id}-name`:undefined}/></label>{errors.name&&<p className="field-error" id={`${id}-name`} role="alert">{errors.name}</p>}
    <div className="form-grid">
      <label className="field">教师<input value={draft.teacher} onChange={e=>patch('teacher',e.target.value)} placeholder="可稍后填写"/></label>
      <label className="field">教室<input value={draft.room} onChange={e=>patch('room',e.target.value)} placeholder="例如 16栋203号教室"/></label>
    </div>
    <div className="form-grid">
      <ChoiceSelect label="星期" value={draft.day} onChange={value=>patch('day',Number(value))} options={Array.from({length:7},(_,index)=>({value:index+1,label:`周${'一二三四五六日'[index]}`}))}/>
      <ChoiceSelect label="课程配色" value={draft.color} onChange={value=>patch('color',value)} options={PALETTE.map((color,index)=>({value:color,label:['鼠尾草','淡薰衣草','奶油杏','晴空蓝','浅玫瑰'][index]}))}/>
    </div>
    <div className="form-grid" ref={periodFields} aria-describedby={errors.periods?`${id}-periods`:undefined}>
      <ChoiceSelect label="开始节次" value={draft.start} onChange={value=>patch('start',Number(value))} options={periodChoices}/>
      <ChoiceSelect label="结束节次" value={draft.end} onChange={value=>patch('end',Number(value))} options={periodChoices}/>
    </div>
    {errors.periods&&<p className="editor-period-error" id={`${id}-periods`} role="alert">{errors.periods}</p>}
    <label className="field">周次<input ref={weeksInput} value={weeks} onChange={e=>{setWeeks(e.target.value);setErrors(current=>({...current,weeks:undefined,save:undefined}));}} placeholder="例如 1-16 或 1-16单" aria-invalid={!!errors.weeks} aria-describedby={`${id}-weeks-help${errors.weeks?` ${id}-weeks-error`:''}`}/></label>{errors.weeks&&<p className="field-error" id={`${id}-weeks-error`} role="alert">{errors.weeks}</p>}
    <p className="book-field-help" id={`${id}-weeks-help`}>已默认选择本学期全部 {data.schedule.term.weeks} 周。可填写“1-16”“1,3,5”或“1-16单”。</p>
    <label className="field">备注<textarea value={draft.notes} onChange={e=>patch('notes',e.target.value)} rows={2} placeholder="可填写上课准备或注意事项"/></label>
    </fieldset>
    {errors.save&&<p role="alert" className="danger">{errors.save}</p>}
    <footer className="editor-actions"><div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={guard.requestClose}>取消</button><button type="submit" className="primary" disabled={busy}>{busy?'正在保存…':'保存课程'}</button></div>{course&&<button type="button" className="text-button danger editor-delete" disabled={busy} onClick={()=>setConfirmDelete(true)}>删除课程</button>}</footer>
    </form>
  </Dialog>
  <UnsavedChanges open={guard.confirming} busy={busy} onContinue={guard.continueEditing} onDiscard={guard.discard} onSave={()=>{guard.continueEditing();void save();}}/>
  <Dialog open={confirmDelete} title="删除这门课程？" onClose={()=>{if(!busy)setConfirmDelete(false);}}>
    <p className="muted editor-delete-note">“{course?.name}”会从课表中移除。此操作不会删除已标记的教材。</p>
    <div className="button-row"><button className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>取消</button><button className="primary" disabled={busy} onClick={()=>void remove()}>{busy?'正在删除…':'确认删除'}</button></div>
  </Dialog></>;
}
