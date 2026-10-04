import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:30000});
const app='com.dolphin.calendar.debug',root='app_webview/Default/IndexedDB/https_appassets.androidplatform.net_0.indexeddb.leveldb';
function hashes(){const files=adb('shell','run-as',app,'ls','-1',root).trim().split(/\r?\n/).filter(Boolean).sort();return adb('shell','run-as',app,'sha256sum',...files.map(f=>root+'/'+f)).trim();}
// 在应用暂停时比较 IndexedDB 文件字节；不借助卸载、清库或清除用户数据。
const before=hashes();const result=adb('install','-r','app/build/outputs/apk/debug/app-debug.apk');assert.match(result,/Success/);
const after=hashes();assert.equal(after,before,'覆盖安装前后数据库文件变化，请人工核对');
await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/update-results.json',JSON.stringify({at:new Date().toISOString(),package:app,installSuccess:true,databaseFilesByteIdentical:true,hashes:after.split('\n'),limitation:'只验证数据库文件完整保留，解锁后的业务界面待复验'},null,2));
console.log('PASS adb install -r / IndexedDB 全部文件 SHA-256 逐项一致');
