import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {rollup} from 'rollup';
const root='web/dist';
const files=await readdir(path.join(root,'assets'));
const assets=files.map(f=>'./assets/'+f);
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
await writeFile(path.join(root,'sw.js'),`
const PREFIX='dolphin-'+self.registration.scope+'-';
const CACHE=PREFIX+'${version}-${Date.now()}';
const ASSETS=${JSON.stringify(['./','./index.html',...assets])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function navigation(request){
  const cache=await caches.open(CACHE);
  const home=new URL('./',self.registration.scope).href;
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response.ok){
      await cache.put(home,response.clone());
      await cache.put(new URL('./index.html',home).href,response.clone());
      return response;
    }
    return await cache.match(home)||response;
  }catch(error){const cached=await cache.match(home);if(cached)return cached;throw error;}
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||!url.href.startsWith(self.registration.scope))return;
  const entry=url.pathname===new URL('./',self.registration.scope).pathname||url.pathname===new URL('./index.html',self.registration.scope).pathname;
  if(event.request.mode==='navigate'&&entry)event.respondWith(navigation(event.request));
  else event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));
});
`);
// 双击版与 APK 使用同一份编译后的 JS/CSS；只在交付时内联资源以支持 file://。
let html=await readFile(path.join(root,'index.html'),'utf8');
const entry=html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if(!entry)throw new Error('构建缺少主入口，无法生成离线页面');
// Flatten the already compiled chunks for file://; HTTP and APK keep deferred imports.
const bundle=await rollup({input:path.join(root,entry[1])});
try{
 const {output}=await bundle.generate({format:'es',inlineDynamicImports:true});
 const code=output.find(item=>item.type==='chunk'&&item.isEntry)?.code;
 if(!code)throw new Error('离线入口合并失败');
 const moduleUrl=`new URL(${JSON.stringify(entry[1])},location.href).href`;
 const inline=code.replaceAll('import.meta.url',moduleUrl);
 html=html.replace(entry[0],()=>`<script type="module">${inline.replace(/<\/script/gi,'<\\/script')}</script>`);
}finally{await bundle.close();}
for(const file of files)if(file.endsWith('.css')){const css=await readFile(path.join(root,'assets',file),'utf8');html=html.replace(/<link rel="stylesheet"[^>]*>/,()=>`<style>${css}</style>`);}
await writeFile(path.join(root,'Dolphin-Calendar-offline.html'),html);
console.log('同一份构建已生成 APK 资源、离线缓存与可双击打开的 HTML。');
