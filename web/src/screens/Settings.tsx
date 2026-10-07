import {Children,isValidElement,useRef,useState,type ReactNode} from 'react';
import {useApp} from '../state/AppState';
import {Icon,type IconName} from '../components/Icon';
import {SystemCalendar} from './SystemCalendar';
import {Background} from './Background';
import {Holidays} from './Holidays';
import {Updates} from './Updates';
import {ChoiceSelect} from '../components/ChoiceSelect';
import {CalendarPicker} from '../components/CalendarPicker';
import {PageLeaveGuard} from '../components/PageLeaveGuard';
import {APP_VERSION,GITHUB_PROFILE_URL} from '../meta';
import {isNative,native} from '../lib/native';
import {coursePeriod} from '../lib/model';
import {normalizeSchedule} from '../lib/import';
import {SHOW_GLASS_MODE_SETTINGS} from '../lib/features';
import type {Course,Settings as Preferences} from '../lib/model';
import type {Route} from '../nav/useNavigation';
export const SETTINGS_GROUPS:{title:string;route:Route;description:string;icon:IconName}[]=[
  {title:'主页',route:'home-settings',description:'日期条与主页快捷按钮',icon:'home'},
  {title:'课表编辑',route:'editor',description:'导入、修改课程，管理教材与日历',icon:'calendar'},
  {title:'外观',route:'appearance',description:'背景图片、深浅模式与玻璃底栏',icon:'sun'},
  {title:'实时通知',route:'notifications',description:'课前提醒、导航状态与通知栏小伙伴',icon:'bell'},
  {title:'导航与学校',route:'navigation',description:'填写学校，选择前往楼栋的地图',icon:'pin'},
  {title:'关于',route:'about',description:'Dolphin Calendar · '+APP_VERSION,icon:'info'}
];
export const ROUTE_TITLES:Record<Route,string>={...Object.fromEntries(SETTINGS_GROUPS.map(g=>[g.route,g.title])),import:'导入课表',books:'我的教材',calendar:'系统日历',interface:'课表转换说明',updates:'应用更新',background:'背景',holidays:'节假日标记','safe-area':'屏幕安全区'} as Record<Route,string>;
export function SettingsHome({push}:{push:(r:Route)=>void}){
  const sections=[
    {title:'课程与日常',items:SETTINGS_GROUPS.slice(0,2)},
    {title:'偏好设置',items:SETTINGS_GROUPS.slice(2,5)},
    {title:'应用',items:SETTINGS_GROUPS.slice(5)}
  ];
  return <div className="page-inner">
    <header className="page-heading"><h1>设置</h1><p>管理课表，安排提醒，调整你的界面。</p></header>
    <div className="profile-card"><span className="avatar"><Icon name="dolphin" size={42}/></span><div><h3>Dolphin Calendar</h3><p>你的课表，只属于你。</p></div><Icon name="shield" size={22}/></div>
    <div className="settings-groups">{sections.map(section=><section className="settings-group" key={section.title} aria-label={section.title}>
      <h2>{section.title}</h2><md-card>{section.items.map(g=><button key={g.route} className="setting-entry" data-setting={g.route} onClick={()=>push(g.route)}>
        <span className={`setting-icon ${g.route}`}><Icon name={g.icon}/></span><span><strong>{g.title}</strong><small>{g.description}</small></span><Icon name="chevron" size={19}/>
      </button>)}</md-card>
    </section>)}</div>
    <p className="settings-footer"><Icon name="shield" size={14}/>本地保存 · 无需账号</p>
  </div>;
}
function Toggle({label,description,value,onChange,id}:{label:string;description?:string;value:boolean;onChange:(v:boolean)=>void;id:string}){return <label className="setting-row" htmlFor={id}><span><strong>{label}</strong>{description&&<small>{description}</small>}</span><input id={id} className="switch" type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>;}
function Select({label,children,value,onChange}:{label:string;children:ReactNode;value:string|number;onChange:(v:string)=>void}){
  const options=Children.toArray(children).filter(isValidElement).map(option=>{const props=option.props as {value:string|number;children:ReactNode};return {value:String(props.value),label:props.children};});
  return <ChoiceSelect label={label} value={value} options={options} onChange={onChange}/>;
}
function LinkRow({title,detail,onClick,icon='chevron'}:{title:string;detail?:string;onClick:()=>void;icon?:IconName}){return <button className="setting-row link-row" onClick={onClick}><span><strong>{title}</strong>{detail&&<small>{detail}</small>}</span><Icon name={icon}/></button>;}
export function SettingsPage({route,push,editCourse,openCourse,showIntro}:{route:Route;push:(r:Route)=>void;editCourse:(c:Course|null)=>void;openCourse:(c:Course)=>void;showIntro:()=>void}){
  const {data,update,toast}=useApp(),s=data.settings;
  const [term,setTerm]=useState(data.schedule.term),[periods,setPeriods]=useState(data.schedule.periods);
  const [coursesExpanded,setCoursesExpanded]=useState(false),[termCalendarOpen,setTermCalendarOpen]=useState(false);
  const baseline=useRef({term:data.schedule.term,periods:data.schedule.periods}),savingTerm=useRef(false);
  const [termBusy,setTermBusy]=useState(false),[termError,setTermError]=useState(''),[termSaved,setTermSaved]=useState(false);
  const termDirty=()=>JSON.stringify({term,periods})!==JSON.stringify(baseline.current);
  function discardTerm(){setTerm(baseline.current.term);setPeriods(baseline.current.periods);setTermError('');}
  const [lyricsExpanded,setLyricsExpanded]=useState(false),[draftLines,setDraftLines]=useState(()=>s.lines.split('\n'));
  function saveLines(lines:string[]){setDraftLines(lines);set('lines',lines.join('\n'));}
  function set<K extends keyof Preferences>(key:K,value:Preferences[K]){void update(d=>({...d,settings:{...d.settings,[key]:value}})).catch(()=>{});}
  function device(action:string){if(isNative())native(action);else toast('请在 Android 安装版中使用系统通知与日程功能');}
  async function saveTerm(){if(savingTerm.current)return false;savingTerm.current=true;setTermBusy(true);setTermError('');setTermSaved(false);try{const raw={term,periods,courses:data.schedule.courses.length?data.schedule.courses:[{name:'validation',day:1,start:1,end:1,weeks:[1]}]};const parsed=normalizeSchedule(raw,data.schedule);await update(d=>({...d,schedule:{...d.schedule,term:parsed.term,periods:parsed.periods}}));baseline.current={term:parsed.term,periods:parsed.periods};setTerm(parsed.term);setPeriods(parsed.periods);setTermSaved(true);toast('学期与节次已保存');return true;}catch(e){setTermError((e as Error).message);return false;}finally{savingTerm.current=false;setTermBusy(false);}}
  function exportSchedule(){const blob=new Blob([JSON.stringify(data.schedule,null,2)],{type:'application/json'});if(isNative()){native('export',{text:JSON.stringify(data.schedule,null,2),name:`dolphin-calendar-${APP_VERSION}.json`});return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dolphin-calendar-${APP_VERSION}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(route==='home-settings')return <><p className="page-purpose">设置主页上的日期范围和快捷操作，课程内容在“课表编辑”中管理。</p><md-card className="form-card"><Toggle id="show-navigation" label="导航课程按钮" description="固定在主页右下角，快速前往下一节课" value={s.showNavigation} onChange={v=>set('showNavigation',v)}/><Toggle id="show-weekend" label="日期条显示周末" description="关闭后只显示周一至周五" value={s.showWeekend} onChange={v=>set('showWeekend',v)}/><LinkRow title="节假日标记" detail={s.holidayMarkers?'已开启 · 选择系统日历来源并刷新年份':'未开启 · 读取系统日历中的休假与补课日期'} onClick={()=>push('holidays')} icon="calendar"/></md-card><p className="hint">日期条可连续左右滑动并点选日期；左右滑动日程也可逐日切换。</p></>;
  if(route==='holidays')return <Holidays/>;
  if(route==='editor')return <>
    <PageLeaveGuard dirty={termDirty} save={saveTerm} discard={discardTerm} busy={termBusy}/>
    <p className="page-purpose">把课表带进来，再调整课程、教材和上课时间。</p>
    <button className="import-entry" onClick={()=>push('import')}><span className="feature-icon"><Icon name="upload"/></span><span><strong>导入课表</strong><small>粘贴 JSON 或选择文件，预览后确认</small></span><Icon name="chevron"/></button>
    <div className="section-heading course-management-heading"><h2><button className="course-disclosure" aria-expanded={coursesExpanded} aria-controls="course-management-list" onClick={()=>setCoursesExpanded(v=>!v)}><span>全部课程<small>{data.schedule.courses.length} 门 · {coursesExpanded?'收起':'展开'}</small></span><Icon name="chevron" size={20}/></button></h2><button className="text-button" onClick={()=>editCourse(null)}><Icon name="add" size={17}/>添加</button></div>
    <p className="section-purpose">{data.schedule.courses.length?'展开后点选课程，修改教师、教室和周次。':'还没有课程。导入课表，或点“添加”手动创建。'}</p>
    {coursesExpanded&&<md-card id="course-management-list" className="form-card course-management">{data.schedule.courses.map(c=><LinkRow key={c.id} title={c.name} detail={`周${'一二三四五六日'[c.day-1]} · ${coursePeriod(c,data.schedule)} · ${c.room||'教室待填写'}`} onClick={()=>editCourse(c)} icon="edit"/>)}{!data.schedule.courses.length&&<div className="management-empty"><Icon name="calendar" size={28}/><p>课程保存后，会同步显示在主页和搜索中。</p></div>}</md-card>}
    <h2 className="subheading">教材与课表转换</h2>
    <md-card className="form-card"><LinkRow title="查看教材" detail={`${Object.keys(data.books).length} 本本地教材 · 从课程详情添加封面和信息`} onClick={()=>push('books')} icon="book"/><LinkRow title="课表转换说明" detail="把截图或教务页面转成可导入的 JSON" onClick={()=>push('interface')} icon="info"/></md-card>
    <h2 className="subheading">备份与同步</h2>
    <md-card className="form-card"><LinkRow title="导出课表 JSON" detail="保存课程备份，之后可以再次导入" onClick={exportSchedule} icon="download"/><LinkRow title="导入到系统日历" detail="按上课日期生成手机日程，支持复原" onClick={()=>push('calendar')} icon="calendar"/></md-card>
    <h2 className="subheading">学期与时间</h2>
    <p className="section-purpose">开学日期决定课程周次；节次时间用于主页和课前提醒。</p>
    <md-card className="form-card"><label className="field">学期名称<input value={term.name} onChange={e=>setTerm({...term,name:e.target.value})}/></label><div className="term-fields"><div className="field"><span id="term-start-label">学期开始日期</span><button className="term-date-trigger" aria-labelledby="term-start-label term-start-value" aria-haspopup="dialog" aria-expanded={termCalendarOpen} onClick={()=>setTermCalendarOpen(true)}><span id="term-start-value">{term.startDate.replaceAll('-','/')}</span><Icon name="calendar" size={18}/></button></div><label className="field term-weeks">学期周数<input type="number" min={1} max={999} value={term.weeks} onChange={e=>setTerm({...term,weeks:Number(e.target.value)})}/></label></div><p className="hint">第 1 周以开始日期所在周的周一计算。</p><details><summary>调整 {periods.length} 节上课时间</summary>{periods.map((p,i)=><div className="period-editor" key={i}><span>{p.label??i+1}</span><input type="time" aria-label={`第${i+1}节开始`} value={p.start} onChange={e=>setPeriods(a=>a.map((v,j)=>j===i?{...v,start:e.target.value}:v))}/><span>—</span><input type="time" aria-label={`第${i+1}节结束`} value={p.end} onChange={e=>setPeriods(a=>a.map((v,j)=>j===i?{...v,end:e.target.value}:v))}/></div>)}</details><p className="save-status" role={termError?"alert":"status"}>{termError|| (termDirty()?"修改尚未保存，确认后点击下方按钮。":termSaved?"学期与上课时间已保存。":"修改后请保存；课程周次将按开学日期重新计算。")}</p><button className="secondary full" disabled={termBusy} onClick={()=>void saveTerm()}>{termBusy?"正在保存…":"保存学期与时间"}</button></md-card>
    {termCalendarOpen&&<CalendarPicker selected={term.startDate} schedule={data.schedule} purpose="term" onSelect={startDate=>{setTerm(t=>({...t,startDate}));setTermCalendarOpen(false);}} onClose={()=>setTermCalendarOpen(false)}/>}
  </>;
  if(route==='books')return <>{Object.entries(data.books).map(([name,b])=><md-card key={name} className="library-book"><div className="book-card">{b.cover?<img src={b.cover} alt={b.title+'封面'}/>:<div className="book-placeholder"><Icon name="book"/></div>}<div><strong>{b.title}</strong><p>{b.publisher||'出版社未填写'}</p><small>{b.edition||'版次未填写'} · {name}</small></div></div><button className="text-button" onClick={()=>{const c=data.schedule.courses.find(c=>c.name===name);if(c)openCourse(c);else toast('当前课表中没有这门课；教材仍保留在本机');}}>查看课程</button></md-card>)}{!Object.keys(data.books).length&&<div className="empty-card"><Icon name="book" size={36}/><h3>你的随身小书架</h3><p>打开课程详情，即可选择封面、填写书名和版次。</p><button className="primary" onClick={()=>push("editor")}>前往课表编辑</button></div>}</>;
  if(route==='appearance')return <>
    <p className="page-purpose">调整背景、文字尺寸和底栏质感，让界面清楚又合心意。选项会即时保存。</p>
    <md-card className="form-card"><LinkRow title="背景" detail={data.background&&s.backgroundEnabled?'自定义图片 · 更换图片或调节背景毛玻璃':'默认背景 · 选择图片并调节毛玻璃'} onClick={()=>push('background')} icon="image"/></md-card>
    <h2 className="subheading">显示与布局</h2>
    <md-card className="form-card"><Select label="深浅模式" value={s.mode} onChange={v=>set('mode',v as Preferences['mode'])}><option value="system">跟随系统</option><option value="light">浅色 · 晴日</option><option value="dark">深色 · 夜航</option></Select><Select label="界面缩放" value={s.scale} onChange={v=>set('scale',Number(v))}>{[.85,.9,1,1.05,1.1].map(v=><option key={v} value={v}>{Math.round(v*100)}%{v===1?' · 默认':''}</option>)}</Select><LinkRow title="屏幕安全区" detail="让顶部内容和底栏避开状态栏、屏幕切口与手势区" onClick={()=>push('safe-area')}/></md-card>
    {(SHOW_GLASS_MODE_SETTINGS||s.glassMode!=='off')&&<>
      <h2 className="subheading">{SHOW_GLASS_MODE_SETTINGS?'液态玻璃':'底栏质感'}</h2>
      <p className="section-purpose">{SHOW_GLASS_MODE_SETTINGS?'选择底栏的透镜效果，或让卡片、按钮与弹窗也使用玻璃质感。背景图片的毛玻璃在“背景”中单独调节。':'调节底栏的边缘光泽、散射与扭曲。背景图片的毛玻璃在“背景”中单独调节。'}</p>
      <md-card className="form-card">{SHOW_GLASS_MODE_SETTINGS&&<><Select label="液态玻璃模式" value={s.glassMode} onChange={value=>{void update(d=>({...d,settings:{...d.settings,glassMode:value as Preferences['glassMode'],glass:value!=='off'}})).catch(()=>{});}}><option value="off">关闭 · 纯色界面</option><option value="partial">部分 · 底栏</option><option value="full">完全 · 全界面</option></Select><p className="hint glass-mode-description">{s.glassMode==='off'?'保留底栏的滑动与弹性选择，使用清楚的纯色表面。':s.glassMode==='full'?'底栏保留透镜，其他界面使用半透明、高光与轻度模糊；文字和主要操作保持清晰。':'仅底栏使用实时透镜；课程卡片和设置保持清楚的纯色表面。'}</p></>}{s.glassMode!=='off'&&([{key:'dispersion',label:'底栏边缘光泽',descs:['关闭 · 清晰边缘','轻微 · 柔和高光','明显 · 增强边缘光泽']},{key:'scattering',label:'底栏散射',descs:['关闭 · 透明轮廓','柔和 · 背景轻度模糊','弥散 · 背景深度模糊']},{key:'distortion',label:'底栏扭曲',descs:['关闭 · 保持背景原貌','轻微 · 轻折射','明显 · 更强的背景折射']} ] as const).map(v=><Select key={v.key} label={v.label} value={s[v.key]} onChange={n=>set(v.key,Number(n))}>{v.descs.map((t,i)=><option key={i} value={i}>{t}</option>)}</Select>)}</md-card>
    </>}
    <md-card className="form-card"><Select label="性能模式" value={s.performance} onChange={v=>set('performance',v as Preferences['performance'])}><option value="auto">自动 · 优先流畅，必要时减少滤镜</option><option value="high">完整效果 · 耗能较高</option></Select></md-card><p className="hint">自动模式会在交互不够流畅时降低折射和模糊处理，滑动与弹性选择继续可用。实际帧率受设备与省电设置影响。</p>
  </>;
  if(route==='background')return <Background/>;
  if(route==='notifications')return <>
    <p className="page-purpose">先开启实时通知，再选择课前提醒、导航行程或通知栏小伙伴。选项会即时保存。</p><div className="journey-guide" aria-label="上课行程的三个步骤"><span><b>1</b>提前提醒<small>课程、教材与教室</small></span><span><b>2</b>去教室<small>点按钮开始导航</small></span><span><b>3</b>我到了<small>直接收起实时状态</small></span></div>{!s.notificationsEnabled&&<p className="hint">总开关已关闭。下方偏好会保留，开启后再生效。</p>}
    <md-card className="form-card"><Toggle id="notifications-enabled" label="Android 实时通知" description="上课提醒、导航行程和通知栏小伙伴的总开关" value={s.notificationsEnabled} onChange={v=>{set('notificationsEnabled',v);if(v)device('notificationPermission');}}/><LinkRow title="查看系统通知权限" onClick={()=>device('notificationStatus')}/></md-card>
    <h2 className="subheading">课前提醒</h2>
    <md-card className="form-card">
      <Toggle id="reminders" label="上课提醒" description="按提前量告知课程、教材和教室" value={s.reminders} onChange={v=>{set('reminders',v);if(v&&s.notificationsEnabled)device('notificationPermission');}}/>
      <Select label="提前提醒" value={s.advance} onChange={v=>set('advance',Number(v))}>{[0,5,10,15,20,30].map(v=><option key={v} value={v}>{v===0?'上课时':`提前 ${v} 分钟`}</option>)}</Select>
      <p className="hint">提醒通知中的“去教室”会打开地图，并切换到进行中的上课行程。提醒由系统调度，省电状态下可能延迟；重启手机后请打开应用恢复提醒。</p>
      <LinkRow title="下次提醒" onClick={()=>device('notificationStatus')}/>
      <LinkRow title="发送一条测试通知" onClick={()=>device('testNotification')}/>
    </md-card>
    <h2 className="subheading">导航中的实时状态</h2>
    <md-card className="form-card">
      <Toggle id="journey-live" label="显示上课行程" description="手动开始导航后显示；关闭即结束当前行程通知" value={s.journeyLive} onChange={v=>{set('journeyLive',v);if(v&&s.notificationsEnabled)device('notificationPermission');}}/>
      <p className="muted">导航行程最长显示 30 分钟；点通知中的“我到了”会直接收起行程，不打开应用。</p>
      <LinkRow title="模拟导航课程并检查状态" onClick={()=>device('liveNotificationStatus')}/>
      <LinkRow title="允许系统实时更新" onClick={()=>device('promotedNotificationSettings')}/>
      <LinkRow title="结束当前行程" onClick={()=>device('stopJourney')}/>
    </md-card>
    <h2 className="subheading">通知栏小伙伴</h2>
    <md-card className="form-card">
      <Toggle id="pet" label="通知栏桌宠" description="没有上课行程时，用一句话陪着你" value={s.pet} onChange={v=>{set('pet',v);if(v&&s.notificationsEnabled)device('notificationPermission');}}/>
      <Toggle id="poke" label="显示“戳一下”按钮" value={s.poke} onChange={v=>set('poke',v)}/>
      <button className="lyrics-disclosure" aria-expanded={lyricsExpanded} onClick={()=>setLyricsExpanded(v=>!v)}><span><strong>台词管理</strong><small>{draftLines.filter(line=>line.trim()).length} 句台词 · 点击{lyricsExpanded?'收起':'展开'}</small></span><Icon name="chevron" size={20}/></button>
      {lyricsExpanded&&<div className="lyrics-list">{draftLines.map((line,i)=><div className="lyric-row" key={i}><input aria-label={`第 ${i+1} 句台词`} value={line} onChange={e=>saveLines(draftLines.map((old,j)=>i===j?e.target.value:old))}/><button className="secondary" aria-label={`删除第 ${i+1} 句台词`} onClick={()=>saveLines(draftLines.filter((_,j)=>j!==i))}>删除</button></div>)}<button className="secondary full" onClick={()=>saveLines([...draftLines,''])}>添加一句台词</button></div>}
      <p className="hint">一行一句；通知会随机挑选一句。编辑后保存在本机。</p>
      <LinkRow title="打开系统通知设置" onClick={()=>device('notificationSettings')}/>
    </md-card>
  </>;
  if(route==='safe-area')return <><md-card className="form-card"><Toggle id="top-auto" label="上端自动留白" description="读取状态栏与屏幕切口" value={s.topAuto} onChange={v=>set('topAuto',v)}/>{!s.topAuto&&<label className="field">上端留白 {s.topInset} dp<input type="range" min={0} max={100} value={s.topInset} onChange={e=>set('topInset',Number(e.target.value))}/></label>}<Toggle id="bottom-auto" label="下端自动留白" description="底栏与浮动按钮一起避开手势区" value={s.bottomAuto} onChange={v=>set('bottomAuto',v)}/>{!s.bottomAuto&&<label className="field">下端留白 {s.bottomInset} dp<input type="range" min={0} max={100} value={s.bottomInset} onChange={e=>set('bottomInset',Number(e.target.value))}/></label>}</md-card><div className="safe-preview"><div>上端留白</div><Icon name="dolphin" size={52}/><div>底栏 + 手势区</div></div><p className="hint">网页与安装版共用同一套安全区逻辑。窄屏内容过大时可在“外观”调小界面缩放。</p></>;
  if(route==='navigation')return <md-card className="form-card"><label className="field">学校名称<input placeholder="例如：浙江大学紫金港校区" value={s.school} onChange={e=>set('school',e.target.value)}/></label><Select label="导航地图" value={s.map} onChange={v=>set('map',v as Preferences['map'])}><option value="amap">高德地图</option><option value="baidu">百度地图</option></Select><p className="muted">地图只搜索学校名与楼栋，完整教室号继续留在课程和通知里供你查看。仅点击导航时才会离开本地应用。</p><p className="hint">校内建筑定位依赖导航软件收录情况，找不到时请核对学校和楼名。</p></md-card>;
  if(route==='calendar')return <SystemCalendar/>;
  if(route==='interface')return <><p className="page-purpose">截图和教务页面需要先转换为 JSON，再导入课表。</p><md-card className="form-card"><h3>已有 JSON？直接导入</h3><p className="muted">粘贴内容或选择 .json 文件，检查课程预览和开学日期后确认。</p><h3>只有截图或网页？先转换</h3><p className="muted">在导入页复制转换提示词，交给你选择的工具整理。确认结果包含课程名、星期、节次和周次，再回到这里导入。</p><button className="secondary full" onClick={()=>push('import')}>查看转换提示词与导入教程</button><p className="hint">导入解析在本机完成。使用外部工具转换时，请自行确认分享的内容。</p></md-card></>;
  if(route==='updates')return <Updates/>;
  if(route==='about')return <><div className="about-hero"><span className="avatar"><Icon name="dolphin" size={50}/></span><h2>Dolphin Calendar</h2><p>把校园日常，轻轻放在一起。</p><span className="version-tag">V{APP_VERSION}</span></div><md-card className="form-card"><LinkRow title="应用更新" detail="每天检查新版本，管理下载方式" onClick={()=>push('updates')} icon="download"/><LinkRow title="重新查看使用引导" detail="导入课表、上课行程与外观设置" onClick={showIntro} icon="info"/><a className="setting-row link-row author-link" href={GITHUB_PROFILE_URL} target="_blank" rel="noopener noreferrer" onClick={event=>{if(isNative()){event.preventDefault();native("openExternal",{url:GITHUB_PROFILE_URL});}}}><span><strong>作者 GitHub</strong><small>tequed232 · 查看公开项目</small></span><Icon name="chevron"/></a><Toggle id="dynamic-color" label="动态取色" description="Android 12 及以上读取系统主题色" value={s.dynamicColor} onChange={v=>{set('dynamicColor',v);if(v)native('theme');}}/><h3>本地，始终是本地</h3><p className="muted">课表与封面存放于 IndexedDB。卸载应用或清除浏览器数据会删除本地内容；建议定期导出课表。</p><h3>开源组件</h3><p className="muted">React / React DOM · MIT<br/>Vite · MIT<br/>TypeScript · Apache-2.0<br/>AndroidX WebKit / Core · Apache-2.0<br/>Kotlin · Apache-2.0</p><p className="hint">完整许可随源码包的 THIRD_PARTY_NOTICES.md 提供。</p></md-card></>;
  return null;
}
