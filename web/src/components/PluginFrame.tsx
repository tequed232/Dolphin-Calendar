import {useEffect,useRef,useState} from 'react';
import {coursesOn,parseDate} from '../lib/model';
import {isNative} from '../lib/native';
import {buildPluginDocument,createPluginSession,jsonBytes,MAX_PLUGIN_DATA_BYTES,MAX_PLUGIN_IMPORT_BYTES,PLUGIN_PROTOCOL,validPluginDate,validatePluginData,type InstalledPlugin,type PluginContext,type PluginPermission} from '../lib/plugins';

type Props={plugin:InstalledPlugin;context:PluginContext;onSelectDate:(date:string)=>void;onOpenCourse:(id:string)=>void;onImport:(json:string)=>void;onLoadData:()=>Promise<unknown>;onSaveData:(value:unknown)=>Promise<void>};
export function pluginSandboxAvailable(){return !isNative()||window.dolphinPluginSandboxSupported===true;}
export function PluginFrame(props:Props){
 const frame=useRef<HTMLIFrameElement>(null),latest=useRef(props);latest.current=props;
 const [generation,setGeneration]=useState(0),[supported,setSupported]=useState(pluginSandboxAvailable),[document,setDocument]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const publish=useRef<(()=>void)|undefined>(undefined);
 const frameLoaded=useRef<(()=>void)|undefined>(undefined);
 useEffect(()=>{const update=()=>setSupported(pluginSandboxAvailable());window.addEventListener('dolphin-plugin-capability',update);return()=>window.removeEventListener('dolphin-plugin-capability',update);},[]);
 useEffect(()=>{
  setError('');setLoading(true);setDocument('');
  if(!supported||!props.plugin.enabled||!props.plugin.manifest.contributes?.view)return;
  const session=createPluginSession(),pluginId=props.plugin.manifest.id;let active=true,ready=false,inflight=0,count=0,windowStart=performance.now(),loads=0;
  let lastRequestId=0;
  const permissions=new Set(props.plugin.manifest.permissions);
  const granted=(permission:PluginPermission)=>{if(!permissions.has(permission))throw new Error('插件未获授权：'+permission);};
  const alive=()=>active&&latest.current.plugin.enabled&&latest.current.plugin.manifest.id===pluginId;
  const send=(value:Record<string,unknown>)=>{if(alive())frame.current?.contentWindow?.postMessage({protocol:PLUGIN_PROTOCOL,session,...value},'*');};
  const publicContext=()=>{const value=latest.current.context;return {date:value.date,mode:value.mode,tokens:{...value.tokens},...(permissions.has('schedule:read')?{schedule:value.schedule}:{} )};};
  const fail=(message:string)=>{if(!active)return;send({type:'stop'});active=false;setError(message);setLoading(false);};
  const timer=window.setTimeout(()=>{if(!ready)fail('插件启动超时，可以重新加载或返回内置视图。');},10000);
  publish.current=()=>{if(ready)send({type:'context',value:publicContext()});};
  const onLoad=()=>{loads++;if(loads>1)fail('插件离开了已安装页面，运行已停止。');};
  const receive=async(event:MessageEvent)=>{
   if(!alive()||event.source!==frame.current?.contentWindow||event.origin!=='null')return;
   const message=event.data;if(!message||typeof message!=='object'||message.protocol!==PLUGIN_PROTOCOL||message.session!==session)return;
   if(typeof message.id!=='string'||!(/^[1-9]\d{0,9}$/.test(message.id)||message.id==='ready'||message.id==='error'))return;
   const reply=(value?:unknown,error?:string)=>send({id:message.id,value,error});
   if(message.id!=='ready'&&message.id!=='error'){
    const id=Number(message.id);if(id<=lastRequestId){reply(undefined,'请求编号重复或顺序无效');return;}
    lastRequestId=id;
   }
   if(performance.now()-windowStart>=1000){windowStart=performance.now();count=0;}
   if(++count>60){reply(undefined,'接口调用过于频繁，请稍后重试');return;}
   if(inflight>=8){reply(undefined,'等待中的接口过多');return;}
   inflight++;
   try{
    if(jsonBytes(message)>(message.method==='requestImport'?MAX_PLUGIN_IMPORT_BYTES+4096:MAX_PLUGIN_DATA_BYTES+4096))throw new Error('接口参数过大');
    if(message.id==='ready'&&message.method==='ready'){if(!ready){ready=true;clearTimeout(timer);setLoading(false);}reply(publicContext());return;}
    if(!ready)throw new Error('请先等待 DolphinPlugin.ready()');
    if(message.method==='runtimeError'){fail('插件运行发生错误，可以重新加载或返回内置视图。');return;}
    const args=message.args;
    switch(message.method){
     case 'getContext':reply(publicContext());break;
     case 'getSchedule':granted('schedule:read');reply(latest.current.context.schedule);break;
     case 'getCourses':{granted('schedule:read');const date=args?.date??latest.current.context.date;if(!validPluginDate(date))throw new Error('日期必须为有效的 YYYY-MM-DD');const schedule=latest.current.context.schedule;reply(schedule?coursesOn(schedule,parseDate(date)):[]);break;}
     case 'getTheme':reply({mode:latest.current.context.mode,tokens:{...latest.current.context.tokens}});break;
     case 'selectDate':granted('navigation:date');if(!validPluginDate(args?.date))throw new Error('日期必须为有效的 YYYY-MM-DD');latest.current.onSelectDate(args.date);reply(null);break;
     case 'openCourse':granted('course:open');if(typeof args?.id!=='string'||!latest.current.context.schedule?.courses.some(course=>course.id===args.id))throw new Error('课程不存在');latest.current.onOpenCourse(args.id);reply(null);break;
     case 'requestImport':{granted('schedule:import');const json=typeof args?.json==='string'?args.json:JSON.stringify(args?.json);if(!json||new TextEncoder().encode(json).length>MAX_PLUGIN_IMPORT_BYTES)throw new Error('导入内容为空或超过 3 MiB');JSON.parse(json);latest.current.onImport(json);reply({previewRequested:true});break;}
     case 'loadData':granted('storage:local');reply(await latest.current.onLoadData());break;
     case 'saveData':{granted('storage:local');const value=validatePluginData(args?.value);await latest.current.onSaveData(value);reply(null);break;}
     default:throw new Error('未知插件接口');
    }
   }catch(error){reply(undefined,error instanceof Error?error.message:'插件接口操作失败');}finally{inflight--;}
  };
  window.addEventListener('message',receive);
  // Install the listener before assigning srcdoc: even an immediate SDK handshake is received.
  setDocument(buildPluginDocument(props.plugin,session));
  frameLoaded.current=onLoad;
  return()=>{clearTimeout(timer);send({type:'stop'});active=false;publish.current=undefined;frameLoaded.current=undefined;window.removeEventListener('message',receive);};
 },[props.plugin.manifest.id,props.plugin.manifest.version,props.plugin.manifest.permissions.join(','),props.plugin.manifest.contributes?.view,props.plugin.html,props.plugin.css,props.plugin.javascript,props.plugin.enabled,supported,generation]);
 useEffect(()=>publish.current?.(),[props.context]);
 if(!supported)return <div className="empty-card plugin-runtime-status" role="status">当前 Android WebView 不支持插件隔离，请更新 Android System WebView 后重试。内置课表可以继续使用。</div>;
 if(!props.plugin.enabled)return null;
 return <section className="plugin-frame-container" aria-label={props.plugin.manifest.name}>
  {error?<div className="empty-card plugin-runtime-status" role="alert"><p>{error}</p><button className="secondary" onClick={()=>setGeneration(value=>value+1)}>重新加载插件</button></div>:<>
   {loading&&<p className="plugin-runtime-status" role="status">正在启动插件…</p>}
   <iframe ref={frame} title={props.plugin.manifest.name} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document||undefined} onLoad={()=>{if(document)frameLoaded.current?.();}} allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'" style={{display:document?'block':'none'}} />
  </>}
 </section>;
}
