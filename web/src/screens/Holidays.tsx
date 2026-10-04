import {useEffect,useState} from 'react';
import {useApp} from '../state/AppState';
import {sameCalendarIds} from '../lib/holidays';
import {PageLeaveGuard} from '../components/PageLeaveGuard';

export function Holidays(){
  const {data,update,holidayReader}=useApp(),[draft,setDraft]=useState(data.holidayCalendarIds),[year,setYear]=useState(holidayReader.year);
  const {calendars,busy,status,failed}=holidayReader;
  const dirty=!sameCalendarIds(draft,data.holidayCalendarIds),validYear=/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=9999;
  const cached=data.holidayRanges.filter(range=>sameCalendarIds(range.calendarIds,data.holidayCalendarIds));
  useEffect(()=>{
    if(calendars)setDraft(data.holidayCalendarIds.filter(id=>calendars.some(calendar=>calendar.id===id)));
  },[calendars]);
  return <div className="holiday-settings">
    <PageLeaveGuard dirty={dirty} discard={()=>setDraft(data.holidayCalendarIds)}/>
    <p className="page-purpose">从你选择的系统日历读取节假日，在主页日期条和月历显示标记。仅标记日期，不会取消、移动课程或改变提醒。</p>
    <md-card className="form-card"><label className="setting-row" htmlFor="holiday-markers"><span><strong>显示节假日标记</strong><small>柔和颜色区分休假、补课与普通节日</small></span><input id="holiday-markers" className="switch" type="checkbox" checked={data.settings.holidayMarkers} onChange={event=>{const enabled=event.target.checked;void update(previous=>({...previous,settings:{...previous.settings,holidayMarkers:enabled}}));}}/></label><div className="holiday-legend" aria-label="节假日标记说明"><span><b className="holiday-mark rest">休</b>休假</span><span><b className="holiday-mark makeup">补</b>补课／补班</span><span><b className="holiday-mark festival">节</b>普通节日</span></div><p className="hint">普通节名不代表放假；来源未写明安排时只显示“节”。</p></md-card>
    <h2 className="subheading">日历来源</h2>
    <md-card className="form-card"><p className="holiday-source-summary">{data.holidaySourceNames.length?`已保存来源：${data.holidaySourceNames.join('、')}`:'尚未选择日历来源'}</p><button className="secondary full" data-action="holiday-calendars" disabled={busy} onClick={holidayReader.readCalendars}>{calendars?'重新读取系统日历来源':'选择系统日历来源'}</button>
      {calendars&&calendars.length>0&&<div className="holiday-source-list" role="group" aria-label="系统日历来源">{calendars.map(calendar=><label key={calendar.id} className="holiday-source-option"><input type="checkbox" data-calendar-id={calendar.id} checked={draft.includes(calendar.id)} disabled={busy} onChange={event=>setDraft(ids=>event.target.checked?[...ids,calendar.id]:ids.filter(id=>id!==calendar.id))}/><span><strong>{calendar.displayName||'未命名日历'}</strong>{calendar.isSuggested&&<small>可能包含节假日 · 请核对</small>}</span></label>)}<button className="secondary full" data-action="holiday-save-sources" disabled={busy||!dirty} onClick={()=>void holidayReader.saveSources(draft)}>保存所选来源</button></div>}
      <p className="hint">仅申请读取系统日历的权限。应用不会自动选中推荐来源；没有节假日日历时，请先在手机日历中添加。</p>
    </md-card>
    <h2 className="subheading">读取年份</h2>
    <md-card className="form-card"><label className="field">节假日年份<input type="number" min={1900} max={9999} aria-label="节假日年份" value={year} disabled={busy} onChange={event=>setYear(event.target.value)}/></label><p className="hint">读取所选年份的 1 月 1 日至 12 月 31 日，包含全年 365／366 天。仅显示已经读取过的日期。</p><button className="primary full" data-action="holiday-refresh" disabled={busy||!validYear||!data.holidayCalendarIds.length||dirty} onClick={()=>holidayReader.readYear(year)}>{busy?'正在读取…':`读取／刷新 ${validYear?year:'所选'} 年节假日`}</button>{dirty&&<p className="hint">请先保存所选来源。</p>}{!data.holidayCalendarIds.length&&<p className="hint">请先选择并保存日历来源。</p>}<p className="holiday-cache-summary">{cached.length?`本机缓存：${[...new Set(cached.map(range=>range.from.slice(0,4)))].join('、')} 年 · 重开后可用`:'当前来源尚无读取缓存'}</p></md-card>
    <p className={`holiday-status ${failed?'error':''}`} role={failed?'alert':'status'}>{status}</p>
    <p className="hint">标记来自所选系统日历。学校的放假、调课安排请以正式通知为准；读取失败会保留之前的缓存。本机保留最近 6 次读取的年份，每年最多 2000 条标记。</p>
  </div>;
}
