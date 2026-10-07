import {useEffect,useRef,useState} from 'react';
import {useApp} from './state/AppState';
import {useNavigation,type Tab} from './nav/useNavigation';
import {Home} from './screens/Home';
import {Search} from './screens/Search';
import {SettingsHome,SettingsPage,ROUTE_TITLES} from './screens/Settings';
import {Import} from './screens/Import';
import {Icon} from './components/Icon';
import {GlassDock} from './components/GlassDock';
import {CourseSheet} from './components/CourseSheet';
import {CourseEditor} from './components/CourseEditor';
import {isNative,native} from './lib/native';
import type {Course} from './lib/model';
import {normalizeRoom,navigationPlace} from './lib/import';
import {useAppearance} from './theme/useAppearance';
import {useWindowInsets} from './theme/useWindowInsets';
import {AppBackground} from './components/AppBackground';
import {Onboarding} from './components/Onboarding';
export function App(){
  const {data,ready,error,update,toast}=useApp(),[detail,setDetail]=useState<{course:Course;origin?:DOMRect}|null>(null),[editing,setEditing]=useState<{course:Course|null}|null>(null),[intro,setIntro]=useState(false),[dialogOpen,setDialogOpen]=useState(false);
  const introSaving=useRef(false);
  const nav=useNavigation(()=>{const dialogs=document.querySelectorAll<HTMLDialogElement>('dialog[open]');const last=dialogs[dialogs.length-1];if(last){last.dispatchEvent(new Event('dolphin-close-request'));return true;}if(detail){if(window.dispatchEvent(new Event('dolphin-close-course-detail',{cancelable:true})))setDetail(null);return true;}return false;},!!detail||dialogOpen);
  useAppearance(data.settings,!!data.background);
  useWindowInsets();
  useEffect(()=>{const observer=new MutationObserver(()=>setDialogOpen(!!document.querySelector('dialog[open]')));observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});return()=>observer.disconnect();},[]);
  useEffect(()=>{if(ready&&!data.onboarded)setIntro(true);},[ready]);
  useEffect(()=>{
    window.dolphinNative=(event)=>{
      if(event.type==='updateStatus'&&event.update)window.dispatchEvent(new CustomEvent('dolphin-update',{detail:event.update}));
      if(event.type==='message')toast(event.message??'');
      if(event.type==='calendarResult')window.dispatchEvent(new CustomEvent('dolphin-calendar',{detail:event}));
      if(event.type==='holidayResult')window.dispatchEvent(new CustomEvent('dolphin-holiday',{detail:event}));
      if(event.type==='date'&&event.value)window.dispatchEvent(new CustomEvent('dolphin-date',{detail:event.value}));
      if(event.type==='course'&&event.courseId){const course=data.schedule.courses.find(c=>c.id===event.courseId);if(course)setDetail({course});}
      if(event.type==='navigateCourse'&&event.courseId){const course=data.schedule.courses.find(c=>c.id===event.courseId);if(course)navigate(course);else toast('这门课程已从课表移除，无法开始导航');}
      if(event.type==='theme'&&event.primary)document.documentElement.style.setProperty('--system-primary',event.primary);
      if(event.type==='systemTheme'){window.dolphinSystemDark=!!event.dark;window.dispatchEvent(new Event('dolphin-system-theme'));}
    };
    native('ready');return()=>{delete window.dolphinNative;};
  },[data.schedule,data.settings]);
  function openCourse(course:Course,el?:HTMLElement){setDetail({course,origin:el?.getBoundingClientRect()});}
  function selectTab(tab:Tab){if(detail){if(!window.dispatchEvent(new Event('dolphin-close-course-detail',{cancelable:true})))return false;setDetail(null);}return nav.select(tab);}
  function navigate(course:Course){
    if(!data.settings.school.trim()){toast('请先填写学校名称，才能准确导航到楼栋');setDetail(null);nav.select('settings');nav.push('navigation');return;}
    const destination=normalizeRoom(course.room);
    if(!destination.room){toast('这门课尚未填写教室，请先编辑课程');return;}
    const building=navigationPlace(destination.room);
    if(!building){toast('教室数据不完整，无法确定楼栋；请先编辑课程');return;}
    const query=`${data.settings.school} ${building}`;
    const url=data.settings.map==='amap'?`https://uri.amap.com/search?keyword=${encodeURIComponent(query)}&callnative=1`:`https://api.map.baidu.com/geocoder?address=${encodeURIComponent(query)}&output=html&src=dolphin.calendar`;
    if(isNative())native('navigate',{url,courseId:course.id,title:course.name,room:destination.room});else window.open(url,'_blank','noopener,noreferrer');
  }
  function openImport(){nav.select('settings');nav.push('import');}
  function addCourse(){nav.select('settings');nav.push('editor');setEditing({course:null});}
  function openUpdates(){nav.select('settings');nav.push('updates');}
  async function finishIntro(next?:()=>void){if(introSaving.current)return;introSaving.current=true;try{if(!data.onboarded)await update(s=>({...s,onboarded:true}));setIntro(false);next?.();}finally{introSaving.current=false;}}
  const top=nav.stack.length-1;
  return <><main className="app-shell"><AppBackground image={data.background} enabled={data.settings.backgroundEnabled}/>
  {error?<div className="fatal-error" role="alert"><Icon name="shield"/><h2>本地数据暂时不可用</h2><p>{error}</p><button className="primary" onClick={()=>location.reload()}>重试读取</button></div>:<>
  <div className="screen-host" inert={!ready}>{(['home','search','settings'] as const).map(tab=>{const active=tab===nav.tab,preview=active&&nav.stack.length===1;return <section key={tab} className={`screen tab-screen ${active?'selected-tab':''} ${active&&!nav.stack.length?'active':''} ${preview?'previous-screen':''}`} aria-hidden={!active||nav.stack.length>0} inert={!active||nav.stack.length>0} data-screen={tab}>{tab==='home'?<Home openUpdates={openUpdates} openCourse={openCourse} openImport={openImport} addCourse={addCourse} navigate={navigate} visible={active&&!nav.stack.length}/>:tab==='search'?<Search openCourse={openCourse} openImport={openImport} addCourse={addCourse}/>:<SettingsHome push={nav.push}/>}</section>;})}
  {nav.stack.map((route,i)=><section key={`${i}-${route}`} className={`screen sub-screen ${i===top?'active':''} ${i===top-1?'previous-screen':''} ${i===top&&nav.returning?'returning':''}`} aria-hidden={i!==top} inert={i!==top} data-screen={route}><div className="page-inner"><header className="sub-header"><button className="icon-button" aria-label="返回上一页" onClick={nav.back}><Icon name="back"/></button><h1>{ROUTE_TITLES[route]}</h1><span/></header>{route==='import'?<Import done={()=>nav.select('home')}/>:<SettingsPage route={route} push={nav.push} editCourse={c=>setEditing({course:c})} openCourse={openCourse} showIntro={()=>setIntro(true)}/>}</div></section>)}
  </div><div id="home-actions-portal"/><GlassDock enabled={data.settings.glassMode!=='off'} distortion={data.settings.distortion} activeIndex={(['home','search','settings'] as const).indexOf(nav.tab)} onSelect={index=>selectTab((['home','search','settings'] as const)[index])}>{(['home','search','settings'] as const).map((tab,i)=><button key={tab} aria-current={nav.tab===tab?'page':undefined} onClick={()=>selectTab(tab)}><span className="dock-content"><span className="dock-icon"><Icon name={tab} size={24}/></span><span>{['首页','搜索','设置'][i]}</span></span></button>)}</GlassDock></>}
  {!ready&&!error&&<div className="startup-state load-note" role="status"><Icon name="dolphin" size={48}/><strong>正在读取本地课表…</strong></div>}
  {detail&&<CourseSheet key={detail.course.id} course={data.schedule.courses.find(c=>c.id===detail.course.id)??detail.course} origin={detail.origin} onClose={()=>setDetail(null)} navigate={navigate} editCourse={c=>{setDetail(null);setEditing({course:c});}}/>}
  {editing&&<CourseEditor course={editing.course} onClose={()=>setEditing(null)}/>}
  {intro&&<Onboarding onSkip={()=>finishIntro()} onImport={()=>finishIntro(openImport)} onAdd={()=>finishIntro(addCourse)} onNotifications={()=>finishIntro(()=>{nav.select('settings');nav.push('notifications');})} onAppearance={()=>finishIntro(()=>{nav.select('settings');nav.push('appearance');})}/>}
  </main></>;
}
