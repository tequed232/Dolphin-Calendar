import { initialData, type AppData, type Settings } from './model';
import {normalizeHolidayDays,normalizeHolidayRanges} from './holidays';
const DATABASE = 'dolphin-calendar';
let connection: Promise<IDBDatabase> | undefined;
function open() {
  return connection ??= new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('数据库升级被另一个窗口阻止，请关闭其他页面后重试'));
  });
}
export async function loadData():Promise<AppData> {
  const db=await open(); return new Promise((resolve,reject)=>{
    const r=db.transaction('state').objectStore('state').get('app');
    r.onsuccess=()=>{
      const defaults=initialData(),saved=r.result as AppData|undefined;
      if(saved&&saved.schema!==1) {reject(new Error('此数据来自更新版本，请升级应用后打开'));return;}
      if(!saved){resolve(defaults);return;}
      const legacyAppearance=!(saved as Partial<AppData>).appearanceRevision;
      const savedSettings={...saved.settings} as Partial<Settings> & {contour?:number};
      delete savedSettings.contour;
      const settings={...defaults.settings,...savedSettings,...(legacyAppearance?{dynamicColor:false}:{})};
      const glassMode=savedSettings.glassMode;
      settings.glassMode=glassMode==='off'||glassMode==='partial'||glassMode==='full'?glassMode:savedSettings.glass===false?'off':'partial';
      settings.glass=settings.glassMode!=='off';
      settings.backgroundBlur=Math.max(0,Math.min(30,Number.isFinite(settings.backgroundBlur)?settings.backgroundBlur:12));
      const background=saved.background?.url?.match(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/)&&saved.background.url.length<=3_000_000?saved.background:undefined;
      const holidayCalendarIds=Array.isArray(saved.holidayCalendarIds)?[...new Set(saved.holidayCalendarIds.filter(id=>typeof id==='string'&&id.length>0))].sort():[];
      const holidaySourceNames=Array.isArray(saved.holidaySourceNames)?saved.holidaySourceNames.filter(name=>typeof name==='string'):[];
      resolve({...defaults,...saved,background,appearanceRevision:2,holidays:normalizeHolidayDays(saved.holidays).slice(-12000),holidayRanges:normalizeHolidayRanges(saved.holidayRanges).slice(-6),holidayCalendarIds,holidaySourceNames,settings:{...settings,holidayMarkers:!!settings.holidayMarkers,backgroundEnabled:!!background&&!!settings.backgroundEnabled}});
    };r.onerror=()=>reject(r.error);
  });
}
export async function saveData(data: AppData) {
  const db=await open(); return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'app');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('保存被中断'));
  });
}
