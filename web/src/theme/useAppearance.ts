import {useEffect} from 'react';
import type {Settings} from '../lib/model';
import {native} from '../lib/native';
import {effectiveGlassMode} from '../lib/features';
export function useAppearance(settings:Settings,hasBackground=false){
  const glassMode=effectiveGlassMode(settings.glassMode);
  useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{const dark=settings.mode==='dark'||(settings.mode==='system'&&(window.dolphinSystemDark??query.matches));document.documentElement.dataset.mode=dark?'dark':'light';native('appearance',{mode:settings.mode,dark});};apply();query.addEventListener('change',apply);window.addEventListener('dolphin-system-theme',apply);return()=>{query.removeEventListener('change',apply);window.removeEventListener('dolphin-system-theme',apply);};},[settings.mode]);
  useEffect(()=>{
    const r=document.documentElement,s=settings;r.dataset.imageBackground='true';r.dataset.customBackground=String(s.backgroundEnabled&&hasBackground);r.style.setProperty('--background-blur',`${s.backgroundBlur}px`);r.dataset.dynamic=String(s.dynamicColor);r.dataset.glass=String(glassMode!=='off');r.dataset.glassMode=glassMode;
    r.style.setProperty('--ui-scale',String(s.scale));r.style.setProperty('--safe-top',s.topAuto?'max(env(safe-area-inset-top, 0px), var(--native-top, 0px))':`${s.topInset}px`);r.style.setProperty('--safe-bottom',s.bottomAuto?'max(env(safe-area-inset-bottom, 0px), var(--native-bottom, 0px))':`${s.bottomInset}px`);
    r.style.setProperty('--glass-blur',`${Math.min(2.5,s.scattering*1.3)}px`);r.style.setProperty('--glass-highlight',String(.12+s.dispersion*.06));r.style.setProperty('--glass-saturation',`${1+s.dispersion*.035}`);r.dataset.refraction=String(s.distortion>0);
  },[settings,hasBackground,glassMode]);
  useEffect(()=>{
    const root=document.documentElement;root.dataset.performance='full';if(glassMode==='off')return;
    let raf=0,until=0,previous=0,frames:number[]=[];
    const sample=(now:number)=>{
      if(previous&&document.visibilityState==='visible')frames.push(now-previous);previous=now;
      // 120 Hz 预算为 8.33ms；只在交互窗口采样，空闲时不运行帧循环。
      if(frames.length>=24){if(frames.filter(v=>v>12.5).length>3&&settings.performance==='auto')root.dataset.performance='reduced';frames=[];}
      if(now<until)raf=requestAnimationFrame(sample);else{raf=0;previous=0;frames=[];}
    };
    const activity=()=>{until=performance.now()+900;if(!raf)raf=requestAnimationFrame(sample);};
    const dragging=(event:PointerEvent)=>{if(event.buttons||event.pointerType==='touch')activity();};
    // 空闲不采样；不稳定设备使用更轻的材质，保留选择与弹簧交互。
    document.addEventListener('scroll',activity,{capture:true,passive:true});document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('pointermove',dragging,{passive:true});
    return()=>{cancelAnimationFrame(raf);document.removeEventListener('scroll',activity,true);document.removeEventListener('pointerdown',activity);document.removeEventListener('pointermove',dragging);};
  },[settings.performance,glassMode]);
}
