import {useEffect,useRef,useState} from 'react';
import {Dialog} from './Dialog';
import {Icon,type IconName} from './Icon';
import {SHOW_GLASS_MODE_SETTINGS} from '../lib/features';
import '../theme/onboarding.css';

type GuideAction=()=>void|Promise<void>;
type OnboardingProps={onSkip:GuideAction;onImport:GuideAction;onAdd:GuideAction;onNotifications?:GuideAction;onAppearance?:GuideAction};
type GuideStep={title:string;description:string;cards:{icon:IconName;title:string;text:string}[]};
const STEPS:GuideStep[]=[
  {title:'先把课表带进来',description:'从一份课表开始，把课程、教室和教材放在一起。',cards:[
    {icon:'upload',title:'粘贴 JSON，预览后导入',text:'已有课表？粘贴内容或选择 JSON 文件，确认课程与开学日期后保存。'},
    {icon:'add',title:'也可以手动添加',text:'暂时没有文件也没关系。先添加一门课，以后随时补齐。'},
  ]},
  {title:'今天的安排，一眼看清',description:'主页先看当天，想看哪一天就选哪一天。',cards:[
    {icon:'calendar',title:'滑动日期，或打开月历',text:'左右滑动日期条查看课程；点“选择日期”跳到指定日期，点“今天”回到当天。'},
    {icon:'navigate',title:'点课程看详情，再去上课',text:'查看老师、教室和教材；在“导航与学校”填写学校后，即可导航到对应楼栋。'},
  ]},
  {title:'按你的习惯，慢慢设置',description:'先开始使用，需要时再开启提醒或调整外观。',cards:[
    {icon:'bell',title:'提前提醒 → 去教室 → 我到了',text:'在“实时通知”开启课前提醒，导航到楼栋；点“我到了”收起实时状态。使用相关功能时才申请权限。'},
    {icon:'image',title:'换背景，调整底栏质感',text:SHOW_GLASS_MODE_SETTINGS?'在“外观”使用内置插画或自选图片、调节毛玻璃；液态玻璃可选关闭、部分或完全。比例与安全区也能调整。':'在“外观”使用内置插画或自选图片、调节背景毛玻璃与底栏质感。界面缩放与安全区也能调整。'},
  ]},
];

export function Onboarding({onSkip,onImport,onAdd,onNotifications,onAppearance}:OnboardingProps){
  const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[scrollable,setScrollable]=useState(false),finished=useRef(false),moving=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),panel=useRef<HTMLElement>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{panel.current?.scrollTo({top:0,behavior:'instant'});},[step]);
  useEffect(()=>{const element=panel.current;if(!element)return;const measure=()=>setScrollable(element.scrollHeight>element.clientHeight+2),observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[step,error]);
  function move(amount:number){
    if(finished.current||moving.current)return;
    moving.current=true;setStep(value=>Math.max(0,Math.min(STEPS.length-1,value+amount)));
    timer.current=setTimeout(()=>{moving.current=false;},180);
  }
  async function finish(action:GuideAction){
    if(finished.current)return;
    finished.current=true;setBusy(true);setError('');
    try{await action();}catch{if(mounted.current){finished.current=false;setBusy(false);setError('引导状态未能保存，请重试。你的课表不会因此更改。');}}
  }
  const current=STEPS[step],last=step===STEPS.length-1;
  return <Dialog open title="欢迎来到 Dolphin" onClose={()=>void finish(onSkip)}>
    <div className="onboarding" data-step={step+1} aria-busy={busy}>
      <div className="onboarding-progress"><span className="onboarding-brand"><Icon name="dolphin" size={30}/><span>让校园日常，从容一点。</span></span><span className="onboarding-page" aria-label={`第 ${step+1} 步，共 ${STEPS.length} 步`}>{step+1} / {STEPS.length}</span></div>
      <ol className="onboarding-track" aria-label="使用引导进度">{['准备课表','查看与导航','提醒与外观'].map((label,index)=><li key={label} aria-current={index===step?'step':undefined} data-complete={index<step}><i/><span>{label}</span></li>)}</ol>
      <section className="onboarding-panel" ref={panel} aria-labelledby="onboarding-step-title">
        <div className="onboarding-copy" aria-live="polite" aria-atomic="true"><h3 id="onboarding-step-title">{current.title}</h3><p>{current.description}</p></div>
        {error&&<p className="onboarding-error" role="alert">{error}</p>}
        <div className="onboarding-cards">{current.cards.map(card=><div className="onboarding-card" key={card.title}><span className="onboarding-card-icon"><Icon name={card.icon} size={21}/></span><div><h4>{card.title}</h4><p>{card.text}</p></div></div>)}</div>
      </section>
      <footer className="onboarding-footer">
        <p className={`onboarding-scroll-note ${scrollable?'':'is-hidden'}`} aria-hidden="true">上下滑动可查看完整说明</p>
        {last?<><div className="onboarding-start"><button className="primary" disabled={busy} onClick={()=>void finish(onImport)}><Icon name="upload" size={18}/>导入第一份课表</button><button className="secondary" disabled={busy} onClick={()=>void finish(onAdd)}><Icon name="add" size={18}/>手动添加课程</button></div>{(onNotifications||onAppearance)&&<div className="onboarding-shortcuts">{onNotifications&&<button className="text-button" disabled={busy} onClick={()=>void finish(onNotifications)}><Icon name="bell" size={15}/>设置提醒</button>}{onAppearance&&<button className="text-button" disabled={busy} onClick={()=>void finish(onAppearance)}><Icon name="image" size={15}/>调整外观</button>}</div>}</>:<button className="primary onboarding-next" disabled={busy} onClick={()=>move(1)}>继续<Icon name="next" size={18}/></button>}
        <div className="onboarding-secondary"><button className="text-button" disabled={busy||step===0} onClick={()=>move(-1)}><Icon name="back" size={16}/>上一步</button><button className="text-button" disabled={busy} onClick={()=>void finish(onSkip)}>先逛一逛</button></div>
        <p className="onboarding-revisit">以后可在“设置 → 关于”重新查看引导。</p>
      </footer>
    </div>
  </Dialog>;
}
