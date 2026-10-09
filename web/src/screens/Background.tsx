import {useEffect,useRef,useState} from 'react';
import {useApp} from '../state/AppState';
import {Icon} from '../components/Icon';
import {prepareBackground} from '../lib/background';
import {DEFAULT_BACKGROUND_URL} from '../lib/defaultBackground';
import {PageLeaveGuard} from '../components/PageLeaveGuard';

export function Background(){
  const {data,update,toast}=useApp(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[blur,setBlur]=useState(data.settings.backgroundBlur);
  const current=useRef(data.settings.backgroundBlur);current.current=data.settings.backgroundBlur;
  const processing=useRef(false);
  useEffect(()=>{setBlur(data.settings.backgroundBlur);},[data.settings.backgroundBlur]);
  useEffect(()=>()=>{document.documentElement.style.setProperty('--background-blur',`${current.current}px`);},[]);
  async function choose(file?:File){if(!file||processing.current)return;processing.current=true;setBusy(true);setError('');try{const image=await prepareBackground(file);await update(d=>({...d,background:image,settings:{...d.settings,backgroundEnabled:true}}));toast(image.sourceWidth<720||image.sourceHeight<1280?'背景已保存；原图较小，在大屏上可能不够清晰':'背景已保存，只留在本机');}catch(e){setError((e as Error).message);}finally{processing.current=false;setBusy(false);}}
  function preview(value:number){setBlur(value);document.documentElement.style.setProperty('--background-blur',`${value}px`);}
  async function saveBlur(){if(blur!==current.current)try{await update(d=>({...d,settings:{...d.settings,backgroundBlur:blur}}));}catch{preview(current.current);}}
  const photo=data.background,active=!!photo&&data.settings.backgroundEnabled,url=active?photo.url:DEFAULT_BACKGROUND_URL;
  return <>
    <PageLeaveGuard dirty={false} discard={()=>{}} busy={busy}/>
    <p className="page-purpose">给日常换一张背景。图片固定在底层，卡片和按钮保持清楚。</p>
    <md-card className="form-card background-card">
      <div className="background-preview" aria-label="背景效果预览">
        <div className="preview-photo" style={{backgroundImage:`url("${url}")`,filter:`blur(${blur}px)`}}/><div className="preview-frost"/><div className="preview-content"><span>背景预览</span><strong>今天</strong><p>让日常，合你的心意。</p><div><Icon name="calendar" size={17}/><span>课程与安排</span></div><div className="preview-navigation"><Icon name="list" size={17}/><Icon name="grid" size={17}/><Icon name="search" size={17}/><Icon name="settings" size={17}/></div></div>
      </div>
      <div className="background-status"><strong>{active?'正在使用自定义图片':'正在使用默认背景'}</strong><small>{active?`${photo.name} · 原图 ${photo.sourceWidth}×${photo.sourceHeight}`:'内置插画 · 可直接调节毛玻璃。'}{photo&&!active&&` 已选图片“${photo.name}”仍保留，可重新启用。`}</small></div>
      <label className={`primary full file-button ${busy?'is-disabled':''}`}><Icon name="image" size={19}/>{busy?'正在处理图片…':photo?'更换背景图片':'选择背景图片'}<input type="file" aria-label="选择背景图片" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/></label>
      <div className="background-actions"><button className="secondary" disabled={!active} onClick={()=>void update(d=>({...d,settings:{...d.settings,backgroundEnabled:false}}))}>使用默认背景</button>{photo&&!active&&<button className="secondary" onClick={()=>void update(d=>({...d,settings:{...d.settings,backgroundEnabled:true}}))}>启用这张图片</button>}{photo&&<button className="text-button" onClick={()=>void update(d=>({...d,background:undefined,settings:{...d.settings,backgroundEnabled:false}}))}>移除图片</button>}</div>
      {error&&<p className="error-box" role="alert">{error}</p>}
    </md-card>
    <h2 className="subheading">背景毛玻璃</h2>
    <md-card className="form-card"><label className="background-range" htmlFor="background-blur"><span><strong>模糊程度</strong><output htmlFor="background-blur">{blur===0?'清晰原图':`${blur} px`}</output></span><input id="background-blur" type="range" min={0} max={30} step={1} value={blur} onChange={e=>preview(Number(e.target.value))} onPointerUp={()=>void saveBlur()} onKeyUp={()=>void saveBlur()} onBlur={()=>void saveBlur()}/><small><span>清晰</span><span>柔和毛玻璃</span></small></label><p className="hint">拖动即预览，松手后保存。默认背景和自定义图片都可调节；只模糊背景，课程、文字和底栏保持清楚。</p></md-card>
    <h2 className="subheading">选图建议</h2>
    <md-card className="form-card image-guide"><p><strong>格式</strong><span>JPG / PNG / WebP，单张不超过 10 MB。</span></p><p><strong>清晰度</strong><span>推荐 1080×1920 或 1440×2560 的竖图；主体放在中央，避免细密文字和强烈反差。</span></p><p><strong>显示方式</strong><span>图片自动居中铺满，不同屏幕会裁去部分边缘。柔光遮罩帮助文字保持易读，大图会自动缩小以节省内存。</span></p><p className="hint"><Icon name="shield" size={15}/>图片只在本机处理和保存，不会上传。</p></md-card>
  </>;
}
