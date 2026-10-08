import {useState} from 'react';
import {useApp} from '../state/AppState';
import {Icon} from '../components/Icon';
import {LinkRow} from '../components/SettingsControls';
import {coursePeriod,type Course} from '../lib/model';
import type {Route} from '../nav/useNavigation';
export function ScheduleManagement({push,editCourse}:{push:(route:Route)=>void;editCourse:(course:Course|null)=>void}){
 const {data}=useApp(),[coursesExpanded,setCoursesExpanded]=useState(false);
  return <>
    <p className="page-purpose">把课表带进来，再调整课程、教材和上课时间。</p>
    <button className="import-entry" onClick={()=>push('import')}><span className="feature-icon"><Icon name="upload"/></span><span><strong>导入课表</strong><small>粘贴 JSON 或选择文件，预览后确认</small></span><Icon name="chevron"/></button>
    <div className="section-heading course-management-heading"><h2><button className="course-disclosure" aria-expanded={coursesExpanded} aria-controls="course-management-list" onClick={()=>setCoursesExpanded(v=>!v)}><span>全部课程<small>{data.schedule.courses.length} 门 · {coursesExpanded?'收起':'展开'}</small></span><Icon name="chevron" size={20}/></button></h2><button className="text-button" onClick={()=>editCourse(null)}><Icon name="add" size={17}/>添加</button></div>
    <p className="section-purpose">{data.schedule.courses.length?'展开后点选课程，修改教师、教室和周次。':'还没有课程。导入课表，或点“添加”手动创建。'}</p>
    {coursesExpanded&&<md-card id="course-management-list" className="form-card course-management">{data.schedule.courses.map(c=><LinkRow key={c.id} title={c.name} detail={`周${'一二三四五六日'[c.day-1]} · ${coursePeriod(c,data.schedule)} · ${c.room||'教室待填写'}`} onClick={()=>editCourse(c)} icon="edit"/>)}{!data.schedule.courses.length&&<div className="management-empty"><Icon name="calendar" size={28}/><p>课程保存后，会同步显示在主页和搜索中。</p></div>}</md-card>}
    <h2 className="subheading">教材与课表转换</h2>
    <md-card className="form-card"><LinkRow title="查看教材" detail={`${Object.keys(data.books).length} 本本地教材 · 从课程详情添加封面和信息`} onClick={()=>push('books')} icon="book"/><LinkRow title="课表转换说明" detail="把截图或教务页面转成可导入的 JSON" onClick={()=>push('interface')} icon="info"/></md-card>
    <h2 className="subheading">备份与同步</h2>
    <md-card className="form-card"><LinkRow title="数据与备份" detail="导出课表 JSON · 恢复课表 · 本机数据说明" onClick={()=>push('data')} icon="download"/><LinkRow title="导入到系统日历" detail="按上课日期生成手机日程，支持复原" onClick={()=>push('calendar')} icon="calendar"/></md-card>
    <h2 className="subheading">课表设置</h2>
    <md-card className="form-card"><LinkRow title="开学日期与课程节数" detail={`${data.schedule.term.startDate} · ${data.schedule.periods.length} 节`} onClick={()=>push('schedule-settings')}/><LinkRow title="上课时间" onClick={()=>push('times')} icon="clock"/></md-card>
  </>;
}
