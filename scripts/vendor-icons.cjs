const fs=require('node:fs'),path=require('node:path');
const manifest={home:'home',search:'search',settings:'settings',back:'chevron_left',next:'chevron_right',add:'add',close:'close',calendar:'calendar_month',book:'menu_book',pin:'location_on',camera:'photo_camera',image:'photo_library',edit:'edit',upload:'upload_file',sun:'light_mode',bell:'notifications',shield:'shield',info:'info',check:'check',copy:'content_copy',download:'download',chevron:'chevron_right',clock:'schedule',spark:'stars',trash:'delete',today:'today',navigate:'near_me'};
const target='web/src/assets/icons';fs.mkdirSync(target,{recursive:true});
const imports=[];
for(const [name,symbol] of Object.entries(manifest)){
  const source=path.join('node_modules/@material-symbols/svg-400/rounded',symbol+'.svg');
  if(!fs.existsSync(source))throw new Error(`Material Symbols 中没有 ${symbol}`);
  const svg=fs.readFileSync(source,'utf8');if(!svg.startsWith('<svg ')||!svg.includes('<path '))throw new Error(`无效图标：${symbol}`);
  fs.writeFileSync(path.join(target,name+'.svg'),svg);imports.push(`import ${name} from '../assets/icons/${name}.svg?raw';`);
}
fs.copyFileSync('node_modules/@material-symbols/svg-400/LICENSE',path.join(target,'LICENSE'));
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({source:'Google Material Symbols',distribution:'@material-symbols/svg-400@0.47.5',style:'rounded',weight:400,license:'Apache-2.0',icons:manifest},null,2));
const output=`// 图标在构建时内联，只包含已选子集；首启不依赖网络或字体加载。\n${imports.join('\n')}\nimport brand from '../assets/brand/app-icon.png';\nconst sources={${Object.keys(manifest).join(',')}};\nexport type IconName=keyof typeof sources|'dolphin';\nconst icons=Object.fromEntries(Object.entries(sources).map(([name,svg])=>[name,{viewBox:svg.match(/viewBox="([^"]+)"/)![1],body:svg.replace(/^<svg[^>]*>/,'').replace(/<\\/svg>\\s*$/,'')}])) as Record<keyof typeof sources,{viewBox:string;body:string}>;\nexport function Icon({name,size=22}:{name:IconName;size?:number}){if(name==='dolphin')return <img className="brand-art" src={brand} width={size} height={size} alt="" aria-hidden="true"/>;const icon=icons[name];return <svg width={size} height={size} viewBox={icon.viewBox} fill="currentColor" aria-hidden="true" data-icon={name} dangerouslySetInnerHTML={{__html:icon.body}}/>;}\n`;
const component='web/src/components/Icon.tsx';if(fs.existsSync(component)&&!fs.readFileSync(component,'utf8').includes('export function Icon'))throw new Error('Icon 组件入口与预期不符，拒绝覆盖');
fs.writeFileSync(component,output);console.log(`已内置 ${Object.keys(manifest).length} 个 Material Symbols SVG，不包含在线字体。`);
