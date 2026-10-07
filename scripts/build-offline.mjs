import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const root='web/dist';
const files=await readdir(path.join(root,'assets'));
const assets=files.map(f=>'./assets/'+f);
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
await writeFile(path.join(root,'sw.js'),`const PREFIX='dolphin-'+self.registration.scope+'-';const CACHE=PREFIX+'${version}-${Date.now()}';const ASSETS=${JSON.stringify(['./','./index.html',...assets])};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method==='GET'&&url.origin===location.origin&&url.href.startsWith(self.registration.scope))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(c=>c||fetch(e.request)));});`);
// 双击版与 APK 使用同一份编译后的 JS/CSS；只在交付时内联资源以支持 file://。
let html=await readFile(path.join(root,'index.html'),'utf8');
for(const file of files){if(file.endsWith('.js')){const code=await readFile(path.join(root,'assets',file),'utf8');const moduleUrl=`new URL(${JSON.stringify('./assets/'+file)},location.href).href`;const inline=code.replaceAll('import.meta.url',moduleUrl);html=html.replace(/<script type="module"[^>]*src="[^\"]+"[^>]*><\/script>/,()=>`<script type="module">${inline.replace(/<\/script/gi,'<\\/script')}</script>`);}if(file.endsWith('.css')){const css=await readFile(path.join(root,'assets',file),'utf8');html=html.replace(/<link rel="stylesheet"[^>]*>/,()=>`<style>${css}</style>`);}}
await writeFile(path.join(root,'Dolphin-Calendar-offline.html'),html);
console.log('同一份构建已生成 APK 资源、离线缓存与可双击打开的 HTML。');
