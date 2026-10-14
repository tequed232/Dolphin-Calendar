import {useEffect,useMemo,useState} from 'react';
import {useApp} from '../state/AppState';
import {usePlugins} from '../state/PluginState';
import {PluginFrame} from './PluginFrame';
import {PLUGIN_THEME_TOKENS,type InstalledPlugin,type PluginContext} from '../lib/plugins';

function themeSnapshot(){const css=getComputedStyle(document.documentElement),mode=document.documentElement.dataset.mode,dark=mode==='dark'||mode!=='light'&&(window.dolphinSystemDark??matchMedia('(prefers-color-scheme: dark)').matches);return {mode:dark?'dark':'light',tokens:Object.fromEntries(PLUGIN_THEME_TOKENS.map(token=>[token,css.getPropertyValue(token).trim()]))} as Pick<PluginContext,'mode'|'tokens'>;}
export function PluginToolView({plugin,date,onSelectDate,onOpenCourse,onImport,onClose}:{plugin:InstalledPlugin;date:string;onSelectDate:(date:string)=>void;onOpenCourse:(id:string)=>void;onImport:(json:string)=>void;onClose:()=>void}){
 const {data}=useApp(),plugins=usePlugins(),[theme,setTheme]=useState(themeSnapshot);
 useEffect(()=>{const refresh=()=>setTheme(themeSnapshot()),observer=new MutationObserver(refresh),query=matchMedia('(prefers-color-scheme: dark)');observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-mode','data-dynamic','style']});observer.observe(document.head,{childList:true,subtree:true,characterData:true});query.addEventListener('change',refresh);refresh();return()=>{observer.disconnect();query.removeEventListener('change',refresh);};},[plugins.state.themeId]);
 // The host retains the full snapshot; PluginFrame filters every public response by permissions.
 const context=useMemo<PluginContext>(()=>({date,...theme,schedule:data.schedule}),[date,theme,data.schedule]);
 return <section className="plugin-tool-view" aria-label={`插件工具：${plugin.manifest.name}`}>
  <div className="plugin-view-toolbar"><span>{plugin.manifest.name}</span><button className="text-button" onClick={onClose}>关闭插件工具</button></div>
  {plugins.error&&<p className="plugin-error" role="alert">{plugins.error}</p>}
  <PluginFrame plugin={plugin} context={context} onSelectDate={onSelectDate} onOpenCourse={onOpenCourse} onImport={onImport} onLoadData={()=>plugins.loadData(plugin.manifest.id)} onSaveData={value=>plugins.saveData(plugin.manifest.id,value)}/>
 </section>;
}
