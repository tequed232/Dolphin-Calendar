/**
 * Exercise an actual, same-package Android release upgrade without clearing data.
 * Before running, install the previous signed release on an isolated emulator,
 * import the synthetic course named below through its UI, and set dark / 110%.
 * This intentionally never uninstalls the package or changes its implementation.
 * Example (PowerShell): node scripts/check-release-upgrade.mjs --serial emulator-5562
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,item,i,all)=>{
  if(item.startsWith('--'))pairs.push([item.slice(2),all[i+1]]);return pairs;
},[]));
const serial=args.serial??'emulator-5562';
const adbPath=args.adb??path.join(process.env.ANDROID_HOME??'D:/Android/Sdk','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const apk=path.resolve(args.apk??'app/build/outputs/apk/release/app-release.apk');
const expectedBefore=Number(args['from-code']??10403),expectedAfter=Number(args['to-code']??10404);
const course=args.course??'RetainedCourse10403',term=args.term??'UpgradeRetention10403';
const pkg='com.dolphin.calendar',prefix=args.prefix??'1.4.4-upgrade';
const evidence=path.resolve('build/evidence');mkdirSync(evidence,{recursive:true});
const results=[];
const report={at:new Date().toISOString(),serial,apk,apkSHA256:createHash('sha256').update(readFileSync(apk)).digest('hex'),syntheticData:{course,term,preferences:['深色 · 夜航','110%']},results};
const run=(...command)=>execFileSync(adbPath,['-s',serial,...command],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#10;/g,'\n').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function nodes(xml){return Array.from(xml.matchAll(/<node\s+([^>]+)>?/g),match=>Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),m=>[m[1],decode(m[2])])));}
let lastXml='';
function dump(){const output=run('shell','uiautomator','dump','/sdcard/dolphin-upgrade-audit.xml');if(!output.includes('dumped to:')){lastXml='';return [];}lastXml=run('shell','cat','/sdcard/dolphin-upgrade-audit.xml');return nodes(lastXml);}
async function waitFor(predicate){for(let i=0;i<15;i++){const ui=dump();if(predicate(ui))return ui;await sleep(1000);}throw new Error('Expected WebView content did not appear');}
function tapNode(ui,test){const node=ui.find(n=>test(n)&&n.bounds&&n.bounds!=='[0,0][0,0]');assert.ok(node,'Expected visible control missing');const b=node.bounds.match(/\d+/g).map(Number);run('shell','input','tap',String(Math.floor((b[0]+b[2])/2)),String(Math.floor((b[1]+b[3])/2)));}
function tapText(ui,text){tapNode(ui,n=>n.text===text&&n.clickable==='true');}
function capture(name){writeFileSync(path.join(evidence,`${prefix}-${name}.xml`),lastXml);run('shell','screencap','-p','/sdcard/dolphin-upgrade-audit.png');run('pull','/sdcard/dolphin-upgrade-audit.png',path.join(evidence,`${prefix}-${name}.png`));}
function packageInfo(){const output=run('shell','dumpsys','package',pkg);const value={versionCode:Number(output.match(/versionCode=(\d+)/)?.[1]),versionName:output.match(/versionName=([^\s]+)/)?.[1],appId:Number(output.match(/appId=(\d+)/)?.[1]),dataDir:output.match(/dataDir=([^\s]+)/)?.[1]};assert.ok(value.appId&&value.dataDir,'Package identity missing');return value;}
function pass(name){results.push(name);console.log('PASS '+name);}
async function launch(){run('shell','am','force-stop',pkg);report.lastLaunch=run('shell','am','start','-n',`${pkg}/.MainActivity`);return waitFor(ui=>ui.some(n=>n.text==='主导航'));}
try{
  report.before=packageInfo();assert.equal(report.before.versionCode,expectedBefore);
  let ui=await launch();assert.ok(ui.some(n=>n.text.includes(course)),'Seeded course missing before update');assert.ok(ui.some(n=>n.text===term),'Seeded term missing before update');capture('before-cold-start');pass('previous release cold-start reads the UI-imported synthetic course and term');
  report.installOutput=run('install','-r',apk);assert.match(report.installOutput,/Success/);pass('adb install -r succeeds without uninstall or data clearing');
  report.after=packageInfo();assert.equal(report.after.versionCode,expectedAfter);assert.ok(report.after.versionCode>report.before.versionCode);assert.equal(report.after.appId,report.before.appId);assert.equal(report.after.dataDir,report.before.dataDir);pass('versionCode increases and Android appId / data directory stay unchanged');
  ui=await launch();assert.ok(ui.some(n=>n.text.includes(course)),'Course lost after update');assert.ok(ui.some(n=>n.text===term),'Term lost after update');capture('after-list');pass('upgraded signed release cold-start reads the same imported course and term');
  const tabs=['列表','平铺','搜索','设置'];
  for(const text of tabs)assert.ok(ui.some(n=>n.text===text&&n.class==='android.widget.Button'&&n.clickable==='true'),`Dock tab ${text} missing`);
  pass('the release APK exposes all four Dock destinations');
  for(const [tab,name,expected] of [['平铺','grid',/平铺课表|^周[一二三四五六日]第\d+节添加临时课程$/],['搜索','search',/^查找整个课表中的课程、教师或教室。$/],['设置','settings',/^管理课表，安排提醒，调整你的界面。$/],['列表','list-return',/^今日日程$/]]){
    tapText(ui,tab);ui=await waitFor(nodes=>nodes.some(n=>expected.test(n.text)&&n.bounds!=='[0,0][0,0]'));capture(`after-${name}`);pass(`navigate to ${tab} in the release APK and verify its page content`);
  }
  tapText(ui,'设置');ui=await waitFor(nodes=>nodes.some(n=>n.text.startsWith('外观 ')&&n.class==='android.widget.Button'));
  tapNode(ui,n=>n.text.startsWith('外观 ')&&n.class==='android.widget.Button');ui=await waitFor(nodes=>nodes.some(n=>n.text==='界面缩放'));capture('after-preferences');
  report.preferences={validation:'Screenshots require visual inspection: selected values are painted inside custom HTML buttons and are absent from the Android accessibility tree.',beforeScreenshot:'1.4.4-upgrade-before-preferences.png',afterScreenshot:`${prefix}-after-preferences.png`,expected:['深色 · 夜航','110%']};
  pass('upgraded APK opens the saved appearance preferences (selected values captured for visual review)');
  report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{writeFileSync(path.join(evidence,`${prefix}-results.json`),JSON.stringify(report,null,2)+'\n');}
