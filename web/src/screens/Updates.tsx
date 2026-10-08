import {useEffect} from 'react';
import {useApp} from '../state/AppState';
import {isNative,native} from '../lib/native';
import {RELEASES_URL} from '../state/useAppUpdates';
import {APP_VERSION} from '../meta';
import {Icon} from '../components/Icon';
import '../theme/updates.css';

export function Updates(){
  const {data,update,appUpdates:status}=useApp(),android=isNative();
  useEffect(()=>{
    if(!android)return;
    native('updateStatus');
    if(status.download!=='running')return;
    const timer=setInterval(()=>native('updateStatus'),2000);return()=>clearInterval(timer);
  },[android,status.download]);
  const set=(key:'autoUpdate'|'directDownload',value:boolean)=>void update(d=>({...d,settings:{...d.settings,[key]:value}})).catch(()=>{});
  const releaseUrl=status.release?.url?.startsWith(RELEASES_URL+'/tag/')?status.release.url:RELEASES_URL;
  function openRelease(){if(android)native('openExternal',{url:releaseUrl});else window.open(releaseUrl,'_blank','noopener,noreferrer');}
  return <>
    <div className="update-summary"><span className="update-symbol"><Icon name="download" size={30}/></span><h2>{status.available?'有新版本可以更新':'应用更新'}</h2><p>当前版本 V{status.installed??APP_VERSION}{status.release&&<> · 最新 {status.release.version}</>}</p><p role="status">{status.busy?'正在检查 GitHub 正式版本…':status.message}</p></div>
    <md-card className="form-card">
      <label className="setting-row" htmlFor="auto-update"><span><strong>启用自动更新检查</strong><small>每天检查一次，只提示新版本，不自动下载或安装</small></span><input id="auto-update" className="switch" type="checkbox" checked={data.settings.autoUpdate} onChange={e=>set('autoUpdate',e.target.checked)}/></label>
      <label className="setting-row" htmlFor="direct-download"><span><strong>允许应用内下载</strong><small>开启后可手动下载正式 APK，安装需由你确认</small></span><input id="direct-download" className="switch" type="checkbox" checked={data.settings.directDownload} disabled={!android} onChange={e=>set('directDownload',e.target.checked)}/></label>
      {status.checkedAt>0&&<p className="hint">上次成功检查：{new Date(status.checkedAt).toLocaleString()}</p>}
      <button className="primary" disabled={status.busy} onClick={()=>void status.check()}>{status.busy?'正在检查…':'立即检查更新'}</button>
      <button className="secondary" onClick={openRelease}>前往 GitHub Release</button>
    </md-card>
    {status.available&&status.release&&<md-card className="form-card"><h2>{status.release.title||`新版本 ${status.release.version}`}</h2>{status.release.publishedAt&&<p className="hint">发布于 {new Date(status.release.publishedAt).toLocaleDateString()}</p>}{status.release.notes&&<p className="update-notes">{status.release.notes}</p>}
      {android&&data.settings.directDownload&&(status.release.assetUrl?<>
        <p className="hint">{status.release.assetName}{status.release.assetSize?` · ${(status.release.assetSize/1024/1024).toFixed(1)} MB`:''}。下载可能使用移动数据。</p>
        {status.download==='running'?<><p role="status">正在下载{status.total&&status.total>0?` · ${Math.min(100,Math.round((status.downloaded??0)/status.total*100))}%`:'…'}</p><button className="secondary" onClick={()=>native('updateDownloads')}>查看系统下载列表</button></>:status.download==='complete'?<button className="primary" onClick={()=>native('updateDownloads')}>下载完成 · 打开下载列表</button>:<><button className="primary" onClick={()=>native('downloadUpdate')}>{status.download==='failed'?'重新下载安装包':'下载安装包'}</button>{status.download==='failed'&&<p className="hint">下载未完成，可重试或前往 GitHub Release。</p>}</>}
      </>:<p className="hint">该版本未提供可直接选择的正式 APK，请前往 GitHub Release。</p>)}
    </md-card>}
    <p className="hint">更新来源为作者 GitHub 的正式 Release，不接收预发布版。自动检查受系统省电与网络影响，可能延迟；重新打开 App 时会补查当天遗漏的检查。关闭自动检查后仍可手动检查。</p>
  </>;
}
