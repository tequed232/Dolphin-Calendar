import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('web/src/assets/icons/manifest.json','utf8'));
const component=await readFile('web/src/components/Icon.tsx','utf8');
function validateIcon(svg){assert.match(svg,/<svg[^>]+viewBox=/);assert.match(svg,/<path /);assert.doesNotMatch(svg,/<(?:script|image|foreignObject)\b|https?:\/\/(?!www\.w3\.org)/i);}
for(const name of Object.keys(manifest.icons)){const svg=await readFile(`web/src/assets/icons/${name}.svg`,'utf8');validateIcon(svg);assert.match(component,new RegExp(`assets/icons/${name}\\.svg\\?raw`));assert.throws(()=>validateIcon(svg.replace('<path ','<script ')));validateIcon(svg);}
const brand=await readFile('web/src/assets/brand/app-icon.png'),native=await readFile('app/src/main/res/drawable-nodpi/app_icon.png');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');assert.equal(hash(brand),hash(native),'网页与启动器应用图标不一致');
const background=await readFile('web/src/assets/backgrounds/default-background.png');
assert.equal(hash(background),'e98ecbc2efc7cfa0fe01f105bbe5332e6baaaef32f1dc9311c259a9590f6eb43','默认背景须与用户本次提供的原图一致');
assert.equal(background.readUInt32BE(16),941);assert.equal(background.readUInt32BE(20),1672);
const live=await readFile('app/src/main/res/drawable-nodpi/live_icon.png');
assert.equal(live.readUInt32BE(16),256);assert.equal(live.readUInt32BE(20),256);
const corrupt=Buffer.from(native);corrupt[0]^=1;assert.notEqual(hash(brand),hash(corrupt));
const css=await readFile('web/src/theme/app.css','utf8');assert.match(css,/\.brand-art\{object-fit:contain;aspect-ratio:1/);
await writeFile('build/evidence/assets-results.json',JSON.stringify({materialSymbols:Object.keys(manifest.icons).length,local:true,mutationRejected:true,brandSha256:hash(brand),nativeMatches:true,defaultBackground:{width:941,height:1672,sha256:hash(background),originalMatches:true},liveIcon:{width:256,height:256,sha256:hash(live)}},null,2));
console.log(`PASS ${Object.keys(manifest.icons).length} 个本地 Material SVG / 变异拒绝 / 两端应用图标哈希一致 / 默认背景原图一致 / 等比显示`);
