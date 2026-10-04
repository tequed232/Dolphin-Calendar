import {useEffect,useId,useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {coursePeriod,compactWeeks,courseDates,type Book,type Course} from '../lib/model';
import {BOOK_LIBRARY,compressCover} from '../lib/cover';
import {navigationPlace} from '../lib/import';
import {useDiscardGuard} from '../lib/useDiscardGuard';
import {Icon} from './Icon';
import {Dialog} from './Dialog';
import {UnsavedChanges} from './UnsavedChanges';

export function CourseSheet({course,origin,onClose,navigate,editCourse}:{course:Course;origin?:DOMRect;onClose:()=>void;navigate:(c:Course)=>void;editCourse:(c:Course)=>void}){
  const {data,update,toast}=useApp(),book=data.books[course.name];
  const sheet=useRef<HTMLDivElement>(null),drag=useRef({y:0,active:false}),lock=useRef(false),closeDetailAfter=useRef(false),baseline=useRef<Book|null>(null),titleInput=useRef<HTMLInputElement>(null),id=useId();
  const [full,setFull]=useState(false),[expandedDates,setExpandedDates]=useState(false),[draft,setDraft]=useState<Book|null>(null),[busy,setBusy]=useState<'cover'|'save'|'remove'|null>(null),[error,setError]=useState(''),[titleError,setTitleError]=useState(''),[confirmRemove,setConfirmRemove]=useState(false);
  const dates=courseDates(course,data.schedule),periods=data.schedule.periods;
  const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(baseline.current);
  const guard=useDiscardGuard(dirty,()=>{setDraft(null);setError('');setTitleError('');if(closeDetailAfter.current)onClose();closeDetailAfter.current=false;},!!busy);
  function requestBookClose(){if(lock.current)return;closeDetailAfter.current=false;guard.requestClose();}
  function continueBookEditing(){closeDetailAfter.current=false;guard.continueEditing();}
  function requestDetailClose(){if(lock.current)return;if(draft){closeDetailAfter.current=true;guard.requestClose();}else onClose();}
  const requestClose=useRef(requestDetailClose);requestClose.current=requestDetailClose;
  useEffect(()=>{
    const el=sheet.current!,r=el.getBoundingClientRect();
    if(origin&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const sx=Math.max(.6,Math.min(1,origin.width/r.width)),sy=Math.max(.35,Math.min(1,origin.height/r.height));el.animate([{transform:`translate(${origin.x+origin.width/2-r.x-r.width/2}px,${origin.y+origin.height/2-r.y-r.height/2}px) scale(${sx},${sy})`,opacity:.5},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});}
    el.querySelector<HTMLButtonElement>('[aria-label="关闭课程详情"]')?.focus();
    const closeEvent=(event:Event)=>{event.preventDefault();requestClose.current();};
    const key=(event:KeyboardEvent)=>{
      if(document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();requestClose.current();}
      else if(event.key==='Tab'){
        const focusable=Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')).filter(node=>node.getClientRects().length>0);
        const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('dolphin-close-course-detail',closeEvent);document.addEventListener('keydown',key);
    return()=>{window.removeEventListener('dolphin-close-course-detail',closeEvent);document.removeEventListener('keydown',key);document.documentElement.classList.remove('gesturing');};
  },[]);
  function newDraft():Book{const builtin=BOOK_LIBRARY[course.name];return book?{...book}:{title:builtin?.title??course.name,publisher:builtin?.publisher??'',edition:'',text:'',source:builtin?'builtin':'manual'};}
  function manual(){if(lock.current)return;const next=newDraft();baseline.current=next;closeDetailAfter.current=false;setDraft(next);setError('');setTitleError('');}
  async function cover(file:File|undefined,source:'camera'|'album'){
    if(!file||lock.current)return;
    lock.current=true;setBusy('cover');setError('');
    const previous=draft??newDraft();if(!draft)baseline.current=previous;
    try{const image=await compressCover(file);setDraft({...previous,source,cover:image});closeDetailAfter.current=false;}
    catch(e){setError(`封面未更换：${(e as Error).message}`);toast((e as Error).message);}
    finally{lock.current=false;setBusy(null);}
  }
  async function save(){
    if(lock.current)return false;
    if(!draft?.title.trim()){closeDetailAfter.current=false;setTitleError('请填写教材名称。');titleInput.current?.focus();return false;}
    lock.current=true;setBusy('save');setError('');setTitleError('');
    try{await update(s=>({...s,books:{...s.books,[course.name]:{...draft,title:draft.title.trim()}}}));setDraft(null);toast('教材已保存在本机');if(closeDetailAfter.current)onClose();closeDetailAfter.current=false;return true;}
    catch(e){closeDetailAfter.current=false;setError(`保存未完成：${(e as Error).message}。修改仍在这里，请重试。`);return false;}
    finally{lock.current=false;setBusy(null);}
  }
  async function remove(){
    if(lock.current)return;lock.current=true;setBusy('remove');setError('');
    try{await update(s=>{const books={...s.books};delete books[course.name];return {...s,books};});setDraft(null);setConfirmRemove(false);toast('已移除这门课的教材');}
    catch(e){setError(`移除未完成：${(e as Error).message}。请重试。`);setConfirmRemove(false);}
    finally{lock.current=false;setBusy(null);}
  }
  const patch=(key:keyof Book,value:string)=>{setDraft(d=>d?{...d,[key]:value}:d);setError('');if(key==='title')setTitleError('');};
  const destination=navigationPlace(course.room);
  return <div className="sheet-scrim" onClick={e=>{if(e.target===e.currentTarget)requestDetailClose();}}>
    <div ref={sheet} role="dialog" aria-modal="true" aria-label={`${course.name}详情`} className={`course-sheet ${full?'expanded':''}`}>
      <div className="sheet-handle" role="button" tabIndex={0} aria-label={full?'收起详情':'展开详情'} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setFull(!full);}}}
        onPointerDown={e=>{drag.current={y:e.clientY,active:true};e.currentTarget.setPointerCapture(e.pointerId);document.documentElement.classList.add('gesturing');}}
        onPointerMove={e=>{if(drag.current.active&&sheet.current){const dy=e.clientY-drag.current.y;sheet.current.style.transform=`translateY(${Math.max(-40,dy)}px)`;}}}
        onPointerUp={e=>{const dy=e.clientY-drag.current.y;drag.current.active=false;document.documentElement.classList.remove('gesturing');if(sheet.current)sheet.current.style.transform='';if(dy>95)requestDetailClose();else if(dy< -35)setFull(true);else if(Math.abs(dy)<8)setFull(!full);}}
        onPointerCancel={()=>{drag.current.active=false;document.documentElement.classList.remove('gesturing');if(sheet.current)sheet.current.style.transform='';}}><span/></div>
      <div className="sheet-body"><header className="sheet-title"><span className={`course-tag ${course.color}`}>周{'一二三四五六日'[course.day-1]} · {coursePeriod(course,data.schedule)}</span><button className="icon-button" aria-label="关闭课程详情" onClick={requestDetailClose}><Icon name="close"/></button></header>
        <h1>{course.name}</h1><p className="teacher">{course.teacher||'教师待填写'}<span> · </span>{periods[course.start-1]?.start}–{periods[course.end-1]?.end}</p>
        <div className="detail-row"><Icon name="calendar"/><div><small>上课周次</small><strong>{compactWeeks(course.weeks)} 周</strong></div></div>
        <div className="date-chips">{(expandedDates?dates:dates.slice(0,4)).map(d=><span key={d}>{Number(d.slice(5,7))}/{Number(d.slice(8))}</span>)}{dates.length>4&&<button className="date-toggle" aria-expanded={expandedDates} onClick={()=>setExpandedDates(!expandedDates)}>{expandedDates?'收起日期':`展开其余 ${dates.length-4} 次日期`}</button>}</div>
        <div className="detail-row"><Icon name="pin"/><div><small>上课地点</small><strong>{course.room||'教室尚未填写'}</strong></div></div>
        {destination?<><button className="secondary full" disabled={!!busy} onClick={()=>navigate(course)}><Icon name="pin" size={18}/>导航至{destination}</button><p className="hint">导航到楼栋入口，到楼后按上方教室号找教室。</p></>:<><button className="secondary full" disabled={!!busy} onClick={()=>editCourse(course)}><Icon name="edit" size={18}/>{course.room?'补全楼栋信息':'填写上课地点'}</button><p className="hint">填写楼栋和教室后，就可以导航到对应楼栋。</p></>}
        <div className="book-heading"><h2>这门课的教材</h2><span>{book?'已保存在本机':'封面与信息仅保存在本机'}</span></div>
        {book?<div className="book-card">{book.cover?<img src={book.cover} alt={`${book.title}封面`}/>:<div className="book-placeholder"><Icon name="book"/></div>}<div><strong>{book.title}</strong><p>{book.publisher||'出版社未填写'}</p><small>{book.edition||'版次未填写'}</small></div><button className="icon-button edit-book" aria-label="编辑教材" disabled={!!busy} onClick={manual}><Icon name="edit" size={20}/></button></div>:<><p className="muted">先填写教材名称，也可以拍一张封面或从相册选择。照片作为本地封面使用，请自行核对书名与版次。</p><button className="primary full" disabled={!!busy} onClick={manual}><Icon name="edit" size={18}/>手动填写教材</button><div className="book-actions"><label className="secondary file-button"><Icon name="camera" size={18}/>{busy==='cover'?'处理封面中…':'拍照导入封面'}<input type="file" capture="environment" accept="image/*" aria-label="拍照导入封面" disabled={!!busy} onChange={e=>{void cover(e.target.files?.[0],'camera');e.target.value='';}}/></label><label className="secondary file-button"><Icon name="image" size={18}/>从相册选图<input type="file" accept="image/*" aria-label="从相册选图" disabled={!!busy} onChange={e=>{void cover(e.target.files?.[0],'album');e.target.value='';}}/></label></div></>}
        {!draft&&error&&<p className="danger" role="alert">{error}</p>}{course.notes&&<p className="notes">{course.notes}</p>}<button className="text-button" disabled={!!busy} onClick={()=>editCourse(course)}>编辑这门课程</button>
      </div>
    </div>
    <Dialog open={!!draft} title={book?'编辑教材':'标记教材'} onClose={requestBookClose}>{draft&&<form className="book-editor-form" onSubmit={e=>{e.preventDefault();void save();}} noValidate aria-busy={!!busy}>
      <div className="book-edit-top">{draft.cover?<img className="cover-preview" src={draft.cover} alt="待保存教材封面"/>:<div className="book-placeholder large"><Icon name="book" size={34}/></div>}<p className="muted">封面只保存在本机<br/>请核对教材名称与版次</p></div>
      <fieldset className="editor-fields" disabled={!!busy}>
        <label className="field">书名<input ref={titleInput} value={draft.title} onChange={e=>patch('title',e.target.value)} aria-invalid={!!titleError} aria-describedby={titleError?`${id}-title`:undefined}/></label>{titleError&&<p className="field-error" id={`${id}-title`} role="alert">{titleError}</p>}
        <label className="field">出版社<input value={draft.publisher} onChange={e=>patch('publisher',e.target.value)} placeholder="可稍后填写"/></label><label className="field">版次<input value={draft.edition} onChange={e=>patch('edition',e.target.value)} placeholder="例如 第 3 版"/></label>
        <label className="field">封面文字（可选）<textarea rows={2} value={draft.text} onChange={e=>patch('text',e.target.value)}/></label>
        <div className="book-cover-actions"><label className="secondary file-button">{busy==='cover'?'处理封面中…':'更换封面'}<input type="file" accept="image/*" aria-label="更换封面" disabled={!!busy} onChange={e=>{void cover(e.target.files?.[0],'album');e.target.value='';}}/></label>{draft.cover&&<button type="button" className="text-button" onClick={()=>setDraft(current=>current?{...current,cover:undefined}:current)}>移除封面</button>}</div>
      </fieldset>
      {error&&<p className="danger" role="alert">{error}</p>}
      <footer className="editor-actions"><div className="button-row"><button type="button" className="secondary" disabled={!!busy} onClick={requestBookClose}>取消</button><button type="submit" className="primary" disabled={!!busy}>{busy==='save'?'正在保存…':busy==='cover'?'处理封面中…':'保存并标记'}</button></div>{book&&<button type="button" className="danger text-button editor-delete" disabled={!!busy} onClick={()=>setConfirmRemove(true)}>移除教材</button>}</footer>
    </form>}</Dialog>
    <UnsavedChanges open={guard.confirming} busy={!!busy} onContinue={continueBookEditing} onDiscard={guard.discard} onSave={()=>{guard.continueEditing();void save();}}/>
    <Dialog open={confirmRemove} title="移除这门课的教材？" onClose={()=>{if(!busy)setConfirmRemove(false);}}>
      <p className="muted">教材信息和保存在应用中的封面将移除。手机相册中的原图会保留，课程也会保留。</p><div className="button-row"><button className="secondary" disabled={!!busy} onClick={()=>setConfirmRemove(false)}>取消</button><button className="primary" disabled={!!busy} onClick={()=>void remove()}>{busy==='remove'?'正在移除…':'确认移除'}</button></div>
    </Dialog>
  </div>;
}
