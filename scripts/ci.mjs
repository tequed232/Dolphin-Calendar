import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','web/vite.config.ts','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'inherit'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const failed=[];
const files=['scripts/check-responsive-navigation.mjs','scripts/check-calendar-swipe.mjs','scripts/check-current-time-line.mjs','scripts/check-toolbar-import.mjs','scripts/check-primary-navigation.mjs','scripts/check-file-times-ui.mjs','scripts/check-home-interaction.mjs','scripts/check-schedule-ui.mjs','scripts/check-updates.mjs','scripts/check-ui.mjs','scripts/check-import-ui.mjs','scripts/check-glass.mjs','scripts/check-experience.mjs','scripts/check-onboarding.mjs','scripts/check-course-experience.mjs','scripts/check-home-search-experience.mjs','scripts/check-master-glass.mjs','scripts/check-background.mjs','scripts/check-calendar-picker.mjs','scripts/check-holidays.mjs','scripts/check-layout.mjs','scripts/check-offline.mjs'];
const version=(await readFile('web/src/meta.ts','utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const report={version,startedAt:new Date().toISOString(),groups:[],completed:false,success:false};
try{
  let ready=false;for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:5173');ready=true;break;}catch{await wait(300);}}
  if(!ready)throw new Error('测试服务器未启动');
  for(const file of files){
    console.log(`GROUP START ${file}`);
    const start=Date.now(),result=await new Promise(resolve=>{
      let output='',errorMessage='',timedOut=false;
      const p=spawn(process.execPath,[file],{stdio:['ignore','pipe','pipe'],env:{...process.env,TEST_OFFLINE:'1'}});
      p.stdout.on('data',chunk=>{output+=chunk.toString();process.stdout.write(chunk);});
      p.stderr.on('data',chunk=>{output+=chunk.toString();process.stderr.write(chunk);});
      const timer=setTimeout(()=>{timedOut=true;errorMessage='测试组超过 180 秒';if(process.platform==='win32')spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore'});else p.kill('SIGKILL');},180_000);
      p.on('error',error=>{errorMessage=error.message;});
      p.on('close',(exitCode,signal)=>{clearTimeout(timer);resolve({file,exitCode,signal,timedOut,error:errorMessage||undefined,passMessages:(output.match(/^PASS /gm)||[]).length,durationMs:Date.now()-start});});
    });
    report.groups.push(result);
    if(result.exitCode!==0||result.error)failed.push(`${file}: ${result.error||result.exitCode}`);
    console.log(`GROUP ${result.exitCode===0&&!result.error?'PASS':'FAIL'} ${file} (${result.passMessages} PASS messages, ${result.durationMs} ms)`);
  }
  report.completed=report.groups.length===files.length;report.success=report.completed&&failed.length===0;
  console.log(`浏览器回归：${report.groups.filter(group=>group.exitCode===0&&!group.error).length}/${files.length} 组通过，${report.groups.reduce((sum,group)=>sum+group.passMessages,0)} 条 PASS 输出。`);
  if(failed.length)throw new Error(`浏览器回归失败：${failed.join(', ')}`);
}finally{server.kill();report.finishedAt=new Date().toISOString();await mkdir('build/evidence',{recursive:true});await writeFile('build/evidence/browser-ci-results.json',JSON.stringify(report,null,2));}
