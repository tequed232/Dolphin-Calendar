import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const result=process.platform==='win32'
  ?spawnSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm run build'],{stdio:'inherit'})
  :spawnSync('npm',['run','build'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
const output=path.resolve('build/pages');
const buildRoot=path.resolve('build')+path.sep;
if(!output.startsWith(buildRoot))throw new Error('发布目录必须位于工程 build 目录内');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp('web/dist',output,{recursive:true});
// Pages opens index.html: inline the compiled application and styles into that entry.
// Images remain alongside it as local assets, also used by the offline download.
await writeFile(path.join(output,'index.html'),await readFile('web/dist/Dolphin-Calendar-offline.html'));
await writeFile(path.join(output,'.nojekyll'),'');
console.log('GitHub Pages 发布包已生成于 build/pages；相对资源路径兼容项目子目录，源码与本机配置不会进入发布包。');
