import {useEffect,useRef,useState} from 'react';
import {useApp} from './state/AppState';
import {useNavigation,TABS,type Tab} from './nav/useNavigation';
import {useHomeFocus} from './state/useHomeFocus';
import {Home} from './screens/Home';
import {Search} from './screens/Search';
import {SettingsHome,SettingsPage,ROUTE_TITLES} from './screens/Settings';
import {Import} from './screens/Import';
import {ScheduleManagement} from './screens/ScheduleManagement';
import {Icon} from './components/Icon';
import {PrimaryNavigation} from './components/PrimaryNavigation';
import {usePrimaryNavigation} from './nav/usePrimaryNavigation';
import {CourseSheet} from './components/CourseSheet';
import {CourseEditor} from './components/CourseEditor';
import {isNative,native} from './lib/native';
import {dateKey,parseDate,weekOf,type Course} from './lib/model';
import {normalizeRoom,navigationPlace} from './lib/import';
import {useAppearance} from './theme/useAppearance';
import {useWindowInsets} from './theme/useWindowInsets';
import {AppBackground} from './components/AppBackground';
import {Onboarding} from './components/Onboarding';
export function App(){
  const {data,ready,error,update,toast}=useApp(),[detail,setDetail]=useState<{course:Course;origin?:DOMRect}|null>(null),[editing,setEditing]=useState<{course:Course|null;seed?:Partial<Course>}|null>(null),[intro,setIntro]=useState(false),[dialogOpen,setDialogOpen]=useState(false);
  const introSaving=useRef(false);
  const bridgeContext=useRef({data,navigate,toast,selectTab});bridgeContext.current={data,navigate,toast,selectTab};
  const [layoutEditing,setLayoutEditing]=useState(false);
  const nav=useNavigation(()=>{if(!window.dispatchEvent(new Event('dolphin-dismiss-layout-editing',{cancelable:true})))return true;const dialogs=document.querySelectorAll<HTMLDialogElement>('dialog[open]');const last=dialogs[dialogs.length-1];if(last){last.dispatchEvent(new Event('dolphin-close-request'));return true;}if(detail){if(window.dispatchEvent(new Event('dolphin-close-course-detail',{cancelable:true})))setDetail(null);return true;}return false;},!!detail||dialogOpen||layoutEditing,ready?(data.settings.timetableMode==='grid'?'grid':'list'):undefined);
  const homeMode=!nav.stack.length&&(nav.tab==='list'||nav.tab==='grid')?nav.tab:undefined;
  const navigationVisible=ready&&!error&&!nav.stack.length&&!detail&&!editing&&!dialogOpen&&!intro;
  const primaryNavigation=usePrimaryNavigation(nav.tab,navigationVisible,ready);
  const view=useHomeFocus({schedule:data.schedule,mode:homeMode,ready:ready&&data.onboarded,overlayOpen:!!detail||dialogOpen||intro,layoutEditing});
  useEffect(()=>{const handle=(event:Event)=>view.selectDate((event as CustomEvent<string>).detail);window.addEventListener('dolphin-date',handle);return()=>window.removeEventListener('dolphin-date',handle);},[]);
  useAppearance(data.settings,!!data.background);
  useWindowInsets();
  useEffect(()=>{const observer=new MutationObserver(()=>setDialogOpen(!!document.querySelector('dialog[open]')));observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});return()=>observer.disconnect();},[]);
  useEffect(()=>{if(ready&&!data.onboarded)setIntro(true);},[ready]);
  useEffect(()=>{
    window.dolphinNative=(event)=>{
      if(event.type==='updateStatus'&&event.update)window.dispatchEvent(new CustomEvent('dolphin-update',{detail:event.update}));
      if(event.type==='message')bridgeContext.current.toast(event.message??'');
      if(event.type==='nativeNavigation')window.dispatchEvent(new CustomEvent('dolphin-native-navigation',{detail:event}));
      if(event.type==='selectTab'&&TABS.includes(event.value as Tab))bridgeContext.current.selectTab(event.value as Tab);
      if(event.type==='calendarResult')window.dispatchEvent(new CustomEvent('dolphin-calendar',{detail:event}));
      if(event.type==='holidayResult')window.dispatchEvent(new CustomEvent('dolphin-holiday',{detail:event}));
      if(event.type==='date'&&event.value)window.dispatchEvent(new CustomEvent('dolphin-date',{detail:event.value}));
      if(event.type==='course'&&event.courseId){const course=bridgeContext.current.data.schedule.courses.find(c=>c.id===event.courseId);if(course)setDetail({course});}
      if(event.type==='navigateCourse'&&event.courseId){const course=bridgeContext.current.data.schedule.courses.find(c=>c.id===event.courseId);if(course)bridgeContext.current.navigate(course);else bridgeContext.current.toast('这门课程已从课表移除，无法开始导航');}
      if(event.type==='theme'&&event.primary)document.documentElement.style.setProperty('--system-primary',event.primary);
      if(event.type==='systemTheme'){window.dolphinSystemDark=!!event.dark;window.dispatchEvent(new Event('dolphin-system-theme'));}
    };
    return()=>{delete window.dolphinNative;};
  },[]);
  useEffect(()=>{if(ready)native('ready');},[ready]);
  function openCourse(course:Course,el?:HTMLElement){setDetail({course,origin:el?.getBoundingClientRect()});}
  function selectTab(tab:Tab){if(tab===nav.tab&&!nav.stack.length)return true;if(detail){if(!window.dispatchEvent(new Event('dolphin-close-course-detail',{cancelable:true})))return false;setDetail(null);}return nav.select(tab,()=>{view.prepareSwitch();window.dispatchEvent(new Event('dolphin-dismiss-layout-editing',{cancelable:true}));if((tab==='list'||tab==='grid')&&data.settings.timetableMode!==tab)void update(s=>({...s,settings:{...s.settings,timetableMode:tab}})).catch(()=>{});});}
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
  function openImport(){view.prepareSwitch();nav.push('import');}
  function quickAdd(seed:Partial<Course>={}){const date=seed.specificDate??dateKey(new Date());setEditing({course:null,seed:{temporary:true,day:((parseDate(date).getDay()+6)%7)+1,start:1,end:1,weeks:[Math.max(1,weekOf(parseDate(date),data.schedule.term.startDate))],specificDate:date,...seed}});}
  function addCourse(){nav.push('editor');setEditing({course:null});}
  function openUpdates(){nav.select('settings');nav.push('updates');}
  async function finishIntro(next?:()=>void){if(introSaving.current)return;introSaving.current=true;try{if(!data.onboarded)await update(s=>({...s,onboarded:true}));setIntro(false);next?.();}finally{introSaving.current=false;}}
  const top=nav.stack.length-1;
  return <><main className="app-shell" data-navigation-visible={navigationVisible} data-navigation-layout={primaryNavigation.layout}><AppBackground image={data.background} enabled={data.settings.backgroundEnabled}/>
  {error?<div className="fatal-error" role="alert"><Icon name="shield"/><h2>本地数据暂时不可用</h2><p>{error}</p><button className="primary" onClick={()=>location.reload()}>重试读取</button></div>:<>
  <div className="screen-host" inert={!ready}>{TABS.map(tab=>{const active=tab===nav.tab,preview=active&&nav.stack.length===1;return <section key={tab} className={`screen tab-screen ${active?'selected-tab':''} ${active&&!nav.stack.length?'active':''} ${preview?'previous-screen':''}`} aria-hidden={!active||nav.stack.length>0} inert={!active||nav.stack.length>0} data-screen={tab}>{(tab==='list'||tab==='grid')?<Home mode={tab} view={view} manage={()=>{view.prepareSwitch();nav.push('editor');}} overlayOpen={!!detail||dialogOpen||intro} onLayoutEditingChange={setLayoutEditing} quickAdd={quickAdd} openUpdates={openUpdates} openCourse={openCourse} openImport={openImport} addCourse={addCourse} navigate={navigate} visible={active&&!nav.stack.length}/>:tab==='search'?<Search openCourse={openCourse} openImport={openImport} addCourse={addCourse}/>:<SettingsHome push={nav.push}/>}</section>;})}
  {nav.stack.map((route,i)=><section key={`${i}-${route}`} className={`screen sub-screen ${i===top?'active':''} ${i===top-1?'previous-screen':''} ${i===top&&nav.returning?'returning':''}`} aria-hidden={i!==top} inert={i!==top} data-screen={route}><div className="page-inner"><header className="sub-header"><button className="icon-button" aria-label="返回上一页" onClick={nav.back}><Icon name="back"/></button><h1>{ROUTE_TITLES[route]}</h1><span/></header>{route==='import'?<Import done={nav.finish}/>:route==='editor'?<ScheduleManagement push={nav.push} editCourse={c=>setEditing({course:c})}/>:<SettingsPage route={route} push={nav.push} editCourse={c=>setEditing({course:c})} openCourse={openCourse} showIntro={()=>setIntro(true)}/>}</div></section>)}
  </div><div id="home-actions-portal"/>{navigationVisible&&!primaryNavigation.nativeAvailable&&<PrimaryNavigation active={nav.tab} onSelect={selectTab}/>}</>}
  {!ready&&!error&&<div className="startup-state load-note" role="status"><Icon name="dolphin" size={48}/><strong>正在读取本地课表…</strong></div>}
  {detail&&<CourseSheet key={detail.course.id} course={data.schedule.courses.find(c=>c.id===detail.course.id)??detail.course} origin={detail.origin} onClose={()=>setDetail(null)} navigate={navigate} editCourse={c=>{setDetail(null);setEditing({course:c});}}/>}
  {editing&&<CourseEditor seed={editing.seed} course={editing.course} onClose={()=>setEditing(null)}/>}
  {intro&&<Onboarding onSkip={()=>finishIntro()} onImport={()=>finishIntro(openImport)} onAdd={()=>finishIntro(addCourse)} onNotifications={()=>finishIntro(()=>{nav.select('settings');nav.push('notifications');})} onAppearance={()=>finishIntro(()=>{nav.select('settings');nav.push('appearance');})}/>}
  </main></>;
}
