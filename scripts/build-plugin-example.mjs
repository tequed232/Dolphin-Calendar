import {mkdir,writeFile} from 'node:fs/promises';
import {EXAMPLE_PLUGIN} from '../web/src/lib/pluginExample.ts';
import {parsePluginPackage} from '../web/src/lib/plugins.ts';
const text=JSON.stringify(EXAMPLE_PLUGIN,null,2);
parsePluginPackage(text);
await mkdir('build/pages/plugins',{recursive:true});
await writeFile('build/pages/plugins/quiet-week.dolphin-plugin.json',text+'\n');
console.log('插件示例生成于Pages，包校验通过。');
