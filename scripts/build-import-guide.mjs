import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {JSON_PROMPT} from '../web/src/lib/import.ts';
import {UNIFIED_CSV_TEMPLATE,UNIFIED_JSON_TEMPLATE} from '../web/src/lib/fileImport.ts';

// Use the same reviewed prompt and examples as the import screen.
const output=path.resolve('build/pages/import-guide');
if(!output.startsWith(path.resolve('build/pages')+path.sep))throw new Error('Unexpected guide output directory');
await mkdir(output,{recursive:true});
await Promise.all([
  writeFile(path.join(output,'prompt.txt'),JSON_PROMPT+'\n'),
  writeFile(path.join(output,'schedule.csv'),'\uFEFF'+UNIFIED_CSV_TEMPLATE),
  writeFile(path.join(output,'schedule.json'),UNIFIED_JSON_TEMPLATE+'\n'),
]);
console.log('导入教程已生成与应用一致的提示词、课程及作息模板。');
