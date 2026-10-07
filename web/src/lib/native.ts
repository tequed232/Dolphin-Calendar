import type {HolidayCalendar,HolidayDay} from './model';
import type {UpdateStatus} from '../state/useAppUpdates';
export type NativeMessage = {type:string;update?:UpdateStatus;message?:string;value?:string;courseId?:string;primary?:string;dark?:boolean;action?:string;success?:boolean;permission?:boolean;count?:number;busy?:boolean;canRestore?:boolean;calendars?:HolidayCalendar[];days?:HolidayDay[];calendarIds?:string[];from?:string;to?:string};
declare global {
  interface Window {
    Dolphin?: { postMessage(value:string):void };
    dolphinBack?: (phase:string,progress?:number,originX?:number,originY?:number)=>void;
    dolphinNative?: (message:NativeMessage)=>void;
    dolphinInsets?: (top:number,bottom:number,keyboard?:number,height?:number)=>void;
    dolphinMetrics?: {backCallbacks:number};
    dolphinSystemDark?: boolean;
  }
}
export const isNative = () => !!window.Dolphin;
export function native(type:string,payload:Record<string,unknown>={}) { window.Dolphin?.postMessage(JSON.stringify({type,...payload})); }
export function haptic(kind='tick') { native('haptic',{kind}); }
export async function copyText(text:string) {
  if(navigator.clipboard?.writeText) {try{await navigator.clipboard.writeText(text);return;}catch{/* 本地离线文件不一定提供剪贴板 API。 */}}
  const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();
  const copied=document.execCommand('copy');input.remove();if(!copied) throw new Error('系统未允许复制，请长按文字复制');
}
