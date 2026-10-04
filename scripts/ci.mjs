import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','web/vite.config.ts','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'inherit'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:5173');ready=true;break;}catch{await wait(300);}}
  if(!ready)throw new Error('测试服务器未启动');
  for(const file of ['scripts/check-ui.mjs','scripts/check-import-ui.mjs','scripts/check-glass.mjs','scripts/check-experience.mjs','scripts/check-onboarding.mjs','scripts/check-course-experience.mjs','scripts/check-home-search-experience.mjs','scripts/check-master-glass.mjs','scripts/check-background.mjs','scripts/check-calendar-picker.mjs','scripts/check-holidays.mjs','scripts/check-layout.mjs','scripts/check-offline.mjs'])await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[file],{stdio:'inherit',env:{...process.env,TEST_OFFLINE:'1'}});p.on('exit',code=>code===0?resolve():reject(new Error(file+'失败')));});
}finally{server.kill();}
