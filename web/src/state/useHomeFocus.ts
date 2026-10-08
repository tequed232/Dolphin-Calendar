import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {coursesOn,dateKey,monday,parseDate,type Course,type Schedule} from '../lib/model';
import {initialHomeFocus,type ViewFocus} from '../lib/homeFocus';
type Options={schedule:Schedule;mode:'list'|'grid'|undefined;ready:boolean;overlayOpen:boolean;layoutEditing:boolean};
export function useHomeFocus({schedule,mode,ready,overlayOpen,layoutEditing}:Options){
 const listRoot=useRef<HTMLDivElement>(null),gridRoot=useRef<HTMLDivElement>(null),listControls=useRef<HTMLDivElement>(null),gridControls=useRef<HTMLDivElement>(null);
 const roots={list:listRoot,grid:gridRoot},headers={list:listControls,grid:gridControls};
 const root=mode?roots[mode]:undefined;
 const [focus,setFocus]=useState<ViewFocus>(()=>({date:dateKey(new Date()),sectionIndex:1,source:'initial'}));
 const [gridToolbarHidden,setGridToolbarHidden]=useState(false),toolbarHidden=useRef(false),gridScroll=useRef({top:0,travel:0});
 const current=useRef(focus),requested=useRef<ViewFocus|null>(null),initialized=useRef(false),interacted=useRef(false),previousMode=useRef(mode),restoring=useRef(false),restoreFrame=useRef(0);
 const context=useRef({schedule,mode,overlayOpen,layoutEditing});context.current={schedule,mode,overlayOpen,layoutEditing};current.current=focus;
 function remember(next:ViewFocus){current.current=next;setFocus(old=>old.date===next.date&&old.sectionIndex===next.sectionIndex&&old.courseId===next.courseId&&old.source===next.source?old:next);}
 function setToolbarHidden(hidden:boolean){
  if(toolbarHidden.current===hidden)return;toolbarHidden.current=hidden;
  // Update hit testing before capturing focus in the same scroll event.
  if(gridControls.current){gridControls.current.dataset.toolbarHidden=String(hidden);gridControls.current.inert=hidden;}
  setGridToolbarHidden(hidden);
 }
 function readingArea(){
  const active=context.current.mode;if(!active)return null;const currentRoot=roots[active],currentControls=headers[active];
  const screen=currentRoot.current?.closest<HTMLElement>('.screen');if(!screen)return null;
  const rect=screen.getBoundingClientRect(),header=currentControls.current?.getBoundingClientRect(),safeTop=rect.top+parseFloat(getComputedStyle(screen).paddingTop);
  const dock=document.querySelector<HTMLElement>('.dock')?.getBoundingClientRect(),floating=document.querySelector<HTMLElement>('.floating-actions button')?.getBoundingClientRect();
  // The grid toolbar keeps its space while animating. Its transform must not move the semantic reading anchor.
  const headerBottom=active==='grid'?(toolbarHidden.current?safeTop:safeTop+(header?.height??0)):(header?.bottom??safeTop);
  const top=Math.max(safeTop,headerBottom)+12;
  const bottom=Math.min(rect.bottom,(dock?.top??rect.bottom)-12,(floating?.top??rect.bottom)-8);
  return {screen,top,bottom:Math.max(top+48,bottom),left:rect.left,right:rect.right,anchor:top+Math.max(48,bottom-top)*.38};
 }
 function capture(horizontal=false){
  if(restoring.current||!context.current.mode||context.current.overlayOpen)return current.current;
  // An actively selected course wins even after the user scrolls it off screen.
  if(context.current.layoutEditing&&current.current.courseId&&context.current.schedule.courses.some(course=>course.id===current.current.courseId))return current.current;
  const area=readingArea();if(!area)return current.current;
  const currentRoot=context.current.mode?roots[context.current.mode].current:null;if(!currentRoot)return current.current;
  const sticky=currentRoot.querySelector<HTMLElement>('.grid-period')?.getBoundingClientRect(),visibleLeft=Math.max(area.left,sticky?.right??area.left);
  const candidates=[...currentRoot.querySelectorAll<HTMLElement>('[data-focus-kind="course"]')].map(el=>({el,rect:el.getBoundingClientRect()})).filter(({el,rect})=>rect.bottom>area.top&&rect.top<area.bottom&&rect.right>visibleLeft&&rect.left<area.right&&(horizontal||current.current.source!=='date'||el.dataset.focusDate===current.current.date));
  const explicit=current.current.source==='selection'?candidates.find(({el})=>el.dataset.courseId===current.current.courseId&&el.dataset.focusDate===current.current.date):undefined;
  const score=({el,rect}:{el:HTMLElement;rect:DOMRect})=>Math.abs(rect.top+Math.min(rect.height/2,80)-area.anchor)+(el.dataset.focusDate===current.current.date?0:16);
  const main=explicit??candidates.sort((a,b)=>score(a)-score(b))[0];
  if(main){remember({date:main.el.dataset.focusDate!,sectionIndex:Number(main.el.dataset.focusSection),courseId:main.el.dataset.courseId,source:explicit?'selection':'viewport'});}
  else{
   const rows=[...currentRoot.querySelectorAll<HTMLElement>('[data-focus-kind="section"]')].map(el=>({el,rect:el.getBoundingClientRect()})).filter(({rect})=>rect.bottom>area.top&&rect.top<area.bottom);
   const row=rows.sort((a,b)=>Math.abs(a.rect.top+a.rect.height/2-area.anchor)-Math.abs(b.rect.top+b.rect.height/2-area.anchor))[0];
   const column=horizontal?[...currentRoot.querySelectorAll<HTMLElement>('.grid-day')].map(el=>({el,rect:el.getBoundingClientRect()})).filter(({rect})=>rect.right>visibleLeft&&rect.left<area.right).sort((a,b)=>Math.abs(a.rect.left+a.rect.width/2-(visibleLeft+area.right)/2)-Math.abs(b.rect.left+b.rect.width/2-(visibleLeft+area.right)/2))[0]:undefined;
   if(row)remember({date:column?.el.dataset.focusDate??current.current.date,sectionIndex:Number(row.el.dataset.focusSection),source:!horizontal&&current.current.source==='date'?'date':'section'});
  }
  return current.current;
 }
 function selectDate(date:string){
  interacted.current=true;
  const grid=context.current.mode==='grid',sameWeek=dateKey(monday(parseDate(date)))===dateKey(monday(parseDate(current.current.date)));
  const next:ViewFocus={date,sectionIndex:current.current.sectionIndex,source:'date'};
  // Picking a list date replaces its content in place. Semantic scrolling belongs
  // to initial entry, layout switches and changing the grid's displayed week.
  requested.current=grid&&!sameWeek?next:null;
  remember(next);
 }
 function rememberCourse(course:Course,date:string){interacted.current=true;remember({date,sectionIndex:course.start,courseId:course.id,source:'selection'});}
 function prepareSwitch(){interacted.current=true;capture();}
 useLayoutEffect(()=>{
  if(!ready||!mode||overlayOpen||!root?.current)return;
  if(!initialized.current){initialized.current=true;if(!interacted.current){const first=initialHomeFocus(schedule,new Date());requested.current=first;remember(first);return;}}
  if(previousMode.current!==mode){previousMode.current=mode;requested.current??=current.current;}
  const target=requested.current;if(!target)return;requested.current=null;
  if(mode==='grid'){setToolbarHidden(false);gridScroll.current.travel=0;}
  const area=readingArea();if(!area)return;
  const section=Math.max(1,Math.min(schedule.periods.length,target.sectionIndex));
  const anchors=[...root.current.querySelectorAll<HTMLElement>('[data-focus-kind]')];
  const course=target.courseId?schedule.courses.find(c=>c.id===target.courseId):coursesOn(schedule,parseDate(target.date)).find(c=>c.start<=section&&c.end>=section);
  const element=(course&&anchors.find(el=>el.dataset.courseId===course.id&&el.dataset.focusDate===target.date))??anchors.find(el=>el.dataset.focusKind==='section'&&Number(el.dataset.focusSection)===section)??root.current.querySelector<HTMLElement>('.selected-day-empty,.home-welcome-card,.date-panel');
  if(!element)return;
  restoring.current=true;
  const rect=element.getBoundingClientRect(),point=rect.top+Math.min(rect.height/2,80);
  area.screen.scrollTop+=point-area.anchor;
  const horizontal=root.current.querySelector<HTMLElement>('.week-grid-scroll'),day=root.current.querySelector<HTMLElement>(`.grid-day[data-focus-date="${target.date}"]`);
  if(horizontal&&day){const a=horizontal.getBoundingClientRect(),b=day.getBoundingClientRect(),scale=a.width/horizontal.clientWidth;horizontal.scrollLeft+=(b.left+b.width/2-a.left-a.width/2)/scale;}
  // A programmatic scroll event arrives after layout; ignore it through the next frame.
  cancelAnimationFrame(restoreFrame.current);restoreFrame.current=requestAnimationFrame(()=>{restoreFrame.current=requestAnimationFrame(()=>{restoring.current=false;});});
 });
 useEffect(()=>{
  const screens=[listRoot,gridRoot].map(ref=>ref.current?.closest<HTMLElement>('.screen')).filter((screen):screen is HTMLElement=>!!screen);
  const scroll=(event:Event)=>{
   const active=context.current.mode?roots[context.current.mode].current?.closest<HTMLElement>('.screen'):null;
   if(event.currentTarget!==active||!active)return;
   if(context.current.mode==='grid'){
    const top=active.scrollTop,delta=top-gridScroll.current.top;gridScroll.current.top=top;
    if(top<24){setToolbarHidden(false);gridScroll.current.travel=0;}
    else if(restoring.current||context.current.overlayOpen)gridScroll.current.travel=0;
    else{
     const travel=gridScroll.current.travel;gridScroll.current.travel=Math.sign(delta)===Math.sign(travel)?travel+delta:delta;
     if(gridScroll.current.travel<-12)setToolbarHidden(false);
     else if(gridScroll.current.travel>24)setToolbarHidden(true);
    }
   }
   if(!restoring.current&&context.current.mode&&!context.current.overlayOpen){interacted.current=true;capture();}
  };
  const horizontal=gridRoot.current?.querySelector<HTMLElement>('.week-grid-scroll');
  const pan=()=>{if(context.current.mode==='grid'&&!restoring.current&&!context.current.overlayOpen){interacted.current=true;capture(true);}};
  horizontal?.addEventListener('scroll',pan,{passive:true});
  screens.forEach(screen=>screen.addEventListener('scroll',scroll,{passive:true}));return()=>{cancelAnimationFrame(restoreFrame.current);screens.forEach(screen=>screen.removeEventListener('scroll',scroll));horizontal?.removeEventListener('scroll',pan);};
 },[]);
 return {roots,headers,focus,selectDate,rememberCourse,prepareSwitch,gridToolbarHidden};
}

export type HomeView=ReturnType<typeof useHomeFocus>;
