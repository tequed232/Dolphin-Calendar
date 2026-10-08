import {spawnSync} from 'node:child_process';
const integrity=spawnSync(process.execPath,['scripts/check-delivery-integrity.mjs'],{stdio:'inherit'});if(integrity.status!==0)process.exit(integrity.status??1);
for(const args of [['scripts/check-source-files.mjs'],['scripts/check-source-files.mjs','--self-test'],['scripts/check-source-push.mjs','--self-test'],['scripts/check-source.mjs'],['scripts/check-assets.mjs'],['--import','tsx','--test','scripts/check-import.test.ts','scripts/check-schedule.test.ts']]){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
if(process.env.TEST_URL){const result=spawnSync(process.execPath,['scripts/check-ui.mjs'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
