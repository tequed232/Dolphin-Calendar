import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {emptyPluginState,loadPluginState,commitPluginState,onPluginStateChange,validatePluginData,PLUGIN_THEME_TOKENS,type PluginPackage,type PluginState} from '../lib/plugins';

type Context={state:PluginState;ready:boolean;error:string;retry:()=>Promise<void>;install:(pkg:PluginPackage)=>Promise<void>;setEnabled:(id:string,value:boolean)=>Promise<void>;remove:(id:string)=>Promise<void>;selectTheme:(id:string|null)=>Promise<void>;loadData:(id:string)=>Promise<unknown>;saveData:(id:string,value:unknown)=>Promise<void>};
const PluginContext=createContext<Context>(null!);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

export function PluginProvider({children}:{children:ReactNode}){
  const [state,setState]=useState<PluginState>(emptyPluginState),[ready,setReady]=useState(false),[error,setError]=useState('');
  const latest=useRef(state),loaded=useRef(false),queue=useRef(Promise.resolve()),generation=useRef(0);
  async function retry(){
    const ticket=++generation.current;loaded.current=false;setReady(false);setError('');
    try{const next=await loadPluginState();if(ticket!==generation.current)return;latest.current=next;loaded.current=true;setState(next);setReady(true);}
    catch(cause){if(ticket===generation.current)setError(`插件数据无法读取：${message(cause)}。请保留本机数据并重试。`);}
  }
  useEffect(()=>{void retry();return()=>{generation.current++;};},[]);
  useEffect(()=>{
    let active=true,refreshing=false,pending=false;
    const refresh=()=>{
      if(!loaded.current)return;pending=true;if(refreshing)return;refreshing=true;
      const task=queue.current.then(async()=>{pending=false;const value=await loadPluginState(latest.current);if(active){latest.current=value;setState(value);}});
      queue.current=task.catch(()=>{});
      void task.catch(()=>{if(active)setError('其他窗口的插件数据暂未读取完成，请重新打开页面；原数据已保留。');}).finally(()=>{refreshing=false;if(active&&pending)refresh();});
    };
    const stop=onPluginStateChange(refresh);return()=>{active=false;stop();};
  },[]);
  async function update(change:(previous:PluginState)=>PluginState){
    const task=queue.current.then(async()=>{
      if(!loaded.current)throw new Error('插件数据尚未读取完成');
      const next=await commitPluginState(change,latest.current);
      latest.current=next;setState(next);setError('');
    });
    queue.current=task.catch(()=>{});
    try{await task;}catch(cause){setError(`插件保存失败：${message(cause)}。本次操作未生效。`);throw cause;}
  }
  const installed=(previous:PluginState,id:string)=>{const plugin=previous.plugins.find(item=>item.manifest.id===id);if(!plugin)throw new Error('插件已卸载或不存在');return plugin;};
  async function install(pkg:PluginPackage){await update(previous=>({...previous,plugins:[...previous.plugins.filter(item=>item.manifest.id!==pkg.manifest.id),{...pkg,enabled:false}],viewId:previous.viewId===pkg.manifest.id?null:previous.viewId,themeId:previous.themeId===pkg.manifest.id?null:previous.themeId}));}
  async function setEnabled(id:string,value:boolean){await update(previous=>{installed(previous,id);return {...previous,plugins:previous.plugins.map(item=>item.manifest.id===id?{...item,enabled:value}:item),viewId:!value&&previous.viewId===id?null:previous.viewId,themeId:!value&&previous.themeId===id?null:previous.themeId};});}
  async function remove(id:string){await update(previous=>{installed(previous,id);const storage={...previous.storage};delete storage[id];return {...previous,plugins:previous.plugins.filter(item=>item.manifest.id!==id),viewId:previous.viewId===id?null:previous.viewId,themeId:previous.themeId===id?null:previous.themeId,storage};});}
  async function selectTheme(id:string|null){await update(previous=>{if(id){const plugin=installed(previous,id);if(!plugin.enabled||!plugin.manifest.contributes?.theme||!plugin.manifest.permissions.includes('theme:app'))throw new Error('请选择已启用并授权的主题插件');}return {...previous,themeId:id};});}
  async function loadData(id:string){if(!loaded.current)throw new Error('插件数据尚未读取完成');const plugin=installed(latest.current,id);if(!plugin.enabled||!plugin.manifest.permissions.includes('storage:local'))throw new Error('插件未启用或未授权专属存储');return validatePluginData(latest.current.storage[id]??null);}
  async function saveData(id:string,value:unknown){const snapshot=validatePluginData(value);await update(previous=>{const plugin=installed(previous,id);if(!plugin.enabled||!plugin.manifest.permissions.includes('storage:local'))throw new Error('插件未启用或未授权专属存储');return {...previous,storage:{...previous.storage,[id]:snapshot}};});}

  // The separate style is removed in one step; user appearance preferences are never rewritten.
  useLayoutEffect(()=>{
    const plugin=ready?state.plugins.find(item=>item.manifest.id===state.themeId&&item.enabled):undefined;
    const theme=plugin?.manifest.permissions.includes('theme:app')?plugin.manifest.contributes?.theme:undefined;
    if(!theme)return;
    const root=document.documentElement,style=document.createElement('style');style.dataset.pluginTheme=plugin!.manifest.id;document.head.append(style);
    const query=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{const dark=root.dataset.mode==='dark'||root.dataset.mode==='system'&&query.matches;const tokens=dark?theme.dark:theme.light;style.textContent=`:root:root{${Object.entries(tokens??{}).filter(([key,value])=>PLUGIN_THEME_TOKENS.includes(key)&&/^#[0-9a-f]{3,8}$/i.test(value)).map(([key,value])=>`${key}:${value}!important;`).join('')}}`;root.style.setProperty('--plugin-theme-mode',dark?'dark':'light');};
    apply();const observer=new MutationObserver(apply);observer.observe(root,{attributes:true,attributeFilter:['data-mode']});query.addEventListener('change',apply);
    return()=>{observer.disconnect();query.removeEventListener('change',apply);style.remove();root.style.removeProperty('--plugin-theme-mode');};
  },[ready,state.plugins,state.themeId]);
  return <PluginContext.Provider value={{state,ready,error,retry,install,setEnabled,remove,selectTheme,loadData,saveData}}>{children}</PluginContext.Provider>;
}
export const usePlugins=()=>useContext(PluginContext);
