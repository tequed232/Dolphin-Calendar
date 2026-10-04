import {useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {Icon} from '../components/Icon';
import {coursePeriod,compactWeeks,type Course} from '../lib/model';
import '../theme/home-search-experience.css';
function Highlight({text,query}:{text:string;query:string}){const i=text.toLowerCase().indexOf(query.toLowerCase());return !query||i<0?<>{text}</>:<>{text.slice(0,i)}<mark>{text.slice(i,i+query.length)}</mark>{text.slice(i+query.length)}</>;}
export function Search({openCourse,openImport,addCourse}:{openCourse:(c:Course,el?:HTMLElement)=>void;openImport?:()=>void;addCourse?:()=>void}){
  const {data}=useApp(),[query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null);const q=query.trim(),hasCourses=!!data.schedule.courses.length;
  const matches=data.schedule.courses.filter(c=>[c.name,c.teacher,c.room].some(v=>v.toLowerCase().includes(q.toLowerCase())));
  function clearSearch(){setQuery('');input.current?.focus();}
  const resultStatus=!hasCourses?'课表中还没有课程':q?`找到 ${matches.length} 门匹配课程`:`课表中共有 ${matches.length} 门课程`;
  return <div className="page-inner search-page">
    <header className="page-heading"><h1>搜索</h1><p>查找整个课表中的课程、教师或教室。</p></header>
    <div className="search-box" role="search"><Icon name="search"/><input ref={input} type="search" autoComplete="off" enterKeyHint="search" placeholder="课程、教师或教室" aria-label="搜索课程" aria-describedby="search-result-status" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="清空搜索" onClick={clearSearch}><Icon name="close" size={18}/></button>}</div>
    <div className="section-heading"><h2>{q?'搜索结果':'全部课程'}</h2><span>{matches.length} 门</span></div>
    <p id="search-result-status" className="search-result-status" role="status" aria-live="polite" aria-atomic="true">{resultStatus}</p>
    {!!matches.length&&<p className="section-purpose">点选课程，查看上课安排、教材或前往教室。</p>}
    <div className="search-results">{matches.map(c=><button className="result-card" key={c.id} onClick={e=>openCourse(c,e.currentTarget)}><span className={`result-icon ${c.color}`}><Icon name="book"/></span><span className="result-content"><strong><Highlight text={c.name} query={q}/></strong><small><Highlight text={`${c.teacher||'教师待填写'} · ${c.room||'教室待填写'}`} query={q}/></small><small>周{'一二三四五六日'[c.day-1]} · {coursePeriod(c,data.schedule)} · {compactWeeks(c.weeks)} 周</small></span><Icon name="chevron" size={18}/></button>)}</div>
    {!matches.length&&<div className="empty-card"><Icon name="search" size={36}/><h3>{hasCourses?'没有找到匹配的课程':'先添加你的课表'}</h3><p>{hasCourses?'换一个课程名、教师姓名或教室号试试。':'导入一份课表，或手动添加第一门课，就能按课程、教师和教室查找。'}</p>{hasCourses?<button className="secondary" onClick={clearSearch}>查看全部课程</button>:<div className="welcome-actions">{openImport&&<button className="primary" onClick={openImport}><Icon name="add" size={18}/>导入课表</button>}{addCourse&&<button className="text-button" onClick={addCourse}>手动添加课程</button>}</div>}</div>}
  </div>;
}
