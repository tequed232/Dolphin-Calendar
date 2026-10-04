import {existsSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
export async function browserOptions(){
  if(process.env.CHROME_PATH)return {channel:'chromium',executablePath:process.env.CHROME_PATH};
  const candidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA,'D:/Program Files','D:/Program Files (x86)'].filter(Boolean).map(p=>path.join(p,'Google/Chrome/Application/chrome.exe'));
  for(const candidate of candidates)if(existsSync(candidate))return {channel:'chromium',executablePath:candidate};
  const edgeCandidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],'D:/Program Files','D:/Program Files (x86)'].filter(Boolean).map(p=>path.join(p,'Microsoft/Edge/Application/msedge.exe'));
  for(const candidate of edgeCandidates)if(existsSync(candidate))return {channel:'chromium',executablePath:candidate};
  // 使用本机已有 Chromium，不下载或覆盖用户的浏览器。
  const cache=path.join(process.env.LOCALAPPDATA??'', 'ms-playwright');
  if(existsSync(cache))for(const name of (await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).reverse()){
    const p=path.join(cache,name,'chrome-win64/chrome.exe');if(existsSync(p))return {channel:'chromium',executablePath:p};
  }
  return {channel:'chromium'};
}
export async function launchBrowser(){return chromium.launch({headless:true,...await browserOptions()});}
