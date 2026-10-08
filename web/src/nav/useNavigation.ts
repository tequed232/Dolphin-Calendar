import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {native} from '../lib/native';
export const TABS=['list','grid','search','settings'] as const;
export type Tab=typeof TABS[number];
export type Route='home-settings'|'holidays'|'editor'|'import'|'books'|'appearance'|'background'|'notifications'|'safe-area'|'navigation'|'about'|'updates'|'calendar'|'interface'|'times'|'schedule-settings'|'data';
function requestLeave(proceed:()=>void){const event=new CustomEvent('dolphin-leave-page',{cancelable:true,detail:proceed});const allowed=window.dispatchEvent(event);if(allowed)proceed();return allowed;}
export function useNavigation(overlayBack:()=>boolean,hasOverlay:boolean,initialTab?:Tab){
  const [tab,setTab]=useState<Tab>('list'),[stack,setStack]=useState<Route[]>([]),[returning,setReturning]=useState(false);
  const state=useRef({stack,tab,hasOverlay,overlayBack});state.current={stack,tab,hasOverlay,overlayBack};
  const initialized=useRef(false);
  useLayoutEffect(()=>{if(initialTab&&!initialized.current){initialized.current=true;setTab(initialTab);}},[initialTab]);
  const lastBack=useRef(0),busy=useRef(false),generation=useRef(0),pendingPop=useRef(false);
  const animations=useRef<Animation[]>([]);
  const layers=useRef<{current:HTMLElement|null;previous:HTMLElement|null}>({current:null,previous:null});
  function clean(){
    generation.current++;animations.current.forEach(animation=>animation.cancel());animations.current=[];
    document.documentElement.classList.remove('gesturing','back-preview');document.documentElement.style.removeProperty('--back-progress');
    for(const layer of [layers.current.current,layers.current.previous]){layer?.style.removeProperty('transform');layer?.style.removeProperty('opacity');layer?.style.removeProperty('transform-origin');}
    layers.current={current:null,previous:null};busy.current=false;pendingPop.current=false;
  }
  // React 先移除退出页，再清理合成层，避免完成帧闪回全尺寸页面。
  useLayoutEffect(()=>{if(pendingPop.current){clean();setReturning(false);}},[stack]);
  function move(progress:number){
    const p=Math.min(1,Math.max(0,progress)),{current,previous}=layers.current;
    if(current){current.style.transform=`translate3d(${p*16}px,${p*24}px,0) scale(${1-p*.12})`;current.style.opacity=String(1-p*.55);}
    if(previous)previous.style.transform=`translate3d(${(-1+p)*14}px,0,0)`;
  }
  function begin(originX=0,originY=.65){
    if(busy.current)return false;
    layers.current={current:document.querySelector('.screen.active'),previous:document.querySelector('.screen.previous-screen')};
    const current=layers.current.current;if(!current)return false;
    current.style.animation='none';
    if(layers.current.previous)layers.current.previous.style.animation='none';
    const rect=current.getBoundingClientRect();
    const x=Math.max(0,Math.min(rect.width,(Number.isFinite(originX)?originX:0)*innerWidth-rect.left));
    const y=Math.max(0,Math.min(rect.height,(Number.isFinite(originY)?originY:.65)*innerHeight-rect.top));
    current.style.transformOrigin=`${x}px ${y}px`;
    document.documentElement.classList.add('gesturing','back-preview');document.documentElement.style.setProperty('--back-progress','0');move(0);return true;
  }
  function settle(commit:boolean){
    const {current,previous}=layers.current;if(!current||busy.current)return;
    busy.current=true;const ticket=++generation.current;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options:KeyframeAnimationOptions={duration:reduced?1:commit?210:170,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'};
    const currentStyle=getComputedStyle(current),previousStyle=previous?getComputedStyle(previous):null;
    // 固定起止值交给合成器；最后一帧全透明，不在半透明时硬切页面。
    const exit=current.animate([{transform:currentStyle.transform,opacity:currentStyle.opacity},{transform:commit?'translate3d(16px,24px,0) scale(.88)':'translate3d(0,0,0) scale(1)',opacity:commit?0:1}],options);
    animations.current=[exit];
    if(previous)animations.current.push(previous.animate([{transform:previousStyle!.transform},{transform:commit?'translate3d(0,0,0)':'translate3d(-14px,0,0)'}],options));
    void exit.finished.then(()=>{
      if(ticket!==generation.current)return;
      if(commit){lastBack.current=performance.now();pendingPop.current=true;setStack(s=>s.slice(0,-1));}
      else clean();
    }).catch(()=>{/* 切换页签或卸载时取消，不执行过期的返回。 */});
  }
  function back(event?:{clientX:number;clientY:number},approved=false){
    const now=performance.now();if(busy.current||now-lastBack.current<350&&!approved)return;
    if(!approved&&state.current.overlayBack())return;
    if(!approved&&state.current.stack.length){requestLeave(()=>back(event,true));return;}
    lastBack.current=now;
    if(state.current.stack.length){if(begin(event&&event.clientX?event.clientX/innerWidth:0,event&&event.clientY?event.clientY/innerHeight:.65)){setReturning(true);settle(true);}}
    else native('exit');
  }
  useEffect(()=>{native('history',{canGoBack:stack.length>0||hasOverlay});},[stack.length,hasOverlay]);
  useEffect(()=>{
    window.dolphinMetrics={backCallbacks:0};
    window.dolphinBack=(phase,progress=0,originX=0,originY=.65)=>{
      window.dolphinMetrics!.backCallbacks++;
      if(phase==='back'){back();return;}
      if(state.current.hasOverlay){if(phase==='commit')back();return;}
      if(!state.current.stack.length||busy.current)return;
      if(phase==='start')begin(originX,originY);
      // 系统触摸进度直接写入合成层，不排队额外一帧。
      if(phase==='progress')document.documentElement.style.setProperty('--back-progress',String(Math.min(1,Math.max(0,progress))));
      if(phase==='progress')move(progress);
      if(phase==='cancel')settle(false);
      if(phase==='commit'&&!requestLeave(()=>{if(!busy.current&&layers.current.current)settle(true);else{clean();back(undefined,true);}}))settle(false);
    };
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))back();};window.addEventListener('keydown',key);
    return()=>{delete window.dolphinBack;window.removeEventListener('keydown',key);clean();};
  },[]);
  return {tab,stack,returning,back,push:(route:Route)=>{if(!busy.current&&state.current.stack.at(-1)!==route)requestLeave(()=>setStack(s=>s.at(-1)===route?s:[...s,route]));},finish:()=>{clean();setReturning(false);setStack(s=>s.slice(0,-1));},select:(next:Tab,onAccepted?:()=>void)=>{if(next===state.current.tab&&!state.current.stack.length)return true;return requestLeave(()=>{onAccepted?.();clean();setReturning(false);setStack([]);setTab(next);});}};
}
