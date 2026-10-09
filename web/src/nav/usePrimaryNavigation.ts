import {useEffect,useRef,useState} from 'react';
import {native,type NativeMessage} from '../lib/native';
import type {Tab} from './useNavigation';

export const RAIL_QUERY='(min-width: 768px), (orientation: landscape) and (min-width: 480px)';
export function usePrimaryNavigation(tab:Tab,visible:boolean,ready:boolean){
  const [layout,setLayout]=useState<'bottom'|'rail'>(()=>matchMedia(RAIL_QUERY).matches?'rail':'bottom');
  const [nativeAvailable,setNativeAvailable]=useState(false);
  const last=useRef('');
  useEffect(()=>{const root=document.documentElement;root.dataset.navigationVisible=String(visible);root.dataset.navigationLayout=layout;return()=>{delete root.dataset.navigationVisible;delete root.dataset.navigationLayout;};},[visible,layout]);
  useEffect(()=>{const query=matchMedia(RAIL_QUERY),change=()=>setLayout(query.matches?'rail':'bottom');query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  useEffect(()=>{
    const receive=(event:Event)=>{
      const message=(event as CustomEvent<NativeMessage>).detail;
      if(!message.available)return;
      setNativeAvailable(true);
      const root=document.documentElement;root.dataset.nativeNavigation='true';
      for(const edge of ['bottom','left','right'] as const)root.style.setProperty(`--native-navigation-${edge}`,`${Math.max(0,Math.min(4096,Number(message[edge])||0))}px`);
    };
    window.addEventListener('dolphin-native-navigation',receive);
    return()=>{window.removeEventListener('dolphin-native-navigation',receive);delete document.documentElement.dataset.nativeNavigation;for(const edge of ['bottom','left','right'])document.documentElement.style.removeProperty(`--native-navigation-${edge}`);};
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const root=document.documentElement,probe=document.createElement('span');probe.hidden=true;document.body.append(probe);
    const color=(token:string)=>{probe.style.color=`var(${token})`;const channels=getComputedStyle(probe).color.match(/[\d.]+/g);return channels?.length&&channels.length>=3?'#'+channels.slice(0,3).map(value=>Math.round(Number(value)).toString(16).padStart(2,'0')).join(''):'#182c2d';};
    const synchronize=()=>{
      const payload={tab,visible:visible&&root.dataset.keyboard!=='true',layout,surface:color('--surface'),accent:color('--accent'),text:color('--ink'),muted:color('--muted')};
      const key=JSON.stringify(payload);if(last.current===key)return;last.current=key;native('navigationState',payload);
    };
    synchronize();const observer=new MutationObserver(synchronize);observer.observe(root,{attributes:true,attributeFilter:['style','data-mode','data-dynamic','data-keyboard']});
    return()=>{observer.disconnect();probe.remove();};
  },[tab,visible,ready,layout,nativeAvailable]);
  return {layout,nativeAvailable};
}
