import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('web/src/assets/icons/manifest.json','utf8'));
const component=await readFile('web/src/components/Icon.tsx','utf8');
function validateIcon(svg){assert.match(svg,/<svg[^>]+viewBox=/);assert.match(svg,/<path /);assert.doesNotMatch(svg,/<(?:script|image|foreignObject)\b|https?:\/\/(?!www\.w3\.org)/i);}
for(const name of Object.keys(manifest.icons)){const svg=await readFile(`web/src/assets/icons/${name}.svg`,'utf8');validateIcon(svg);assert.match(component,new RegExp(`assets/icons/${name}\\.svg\\?raw`));assert.throws(()=>validateIcon(svg.replace('<path ','<script ')));validateIcon(svg);}
const brand=await readFile('web/src/assets/brand/app-icon.png'),native=await readFile('app/src/main/res/drawable-nodpi/app_icon.png');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function pngSize(buffer){assert.ok(buffer.length>=33,'PNG 文件不完整');assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a','必须使用 PNG 图片');assert.equal(buffer.subarray(12,16).toString('ascii'),'IHDR','PNG 缺少尺寸信息');return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};}
const approvedBrandSha256='7ef13436c24ec589628b140098e518efb0027f04ec78cae58f1cdbbc3ee81d4d';
assert.equal(hash(brand),approvedBrandSha256,'正式品牌图须与用户提供的 PNG 原图一致');assert.deepEqual(pngSize(brand),{width:1084,height:1084});assert.equal(hash(brand),hash(native),'网页与启动器应用图标不一致');
const background=await readFile('web/src/assets/backgrounds/default-background.png');
assert.equal(hash(background),'e98ecbc2efc7cfa0fe01f105bbe5332e6baaaef32f1dc9311c259a9590f6eb43','默认背景须与用户本次提供的原图一致');
assert.equal(background.readUInt32BE(16),941);assert.equal(background.readUInt32BE(20),1672);
const live=await readFile('app/src/main/res/drawable-nodpi/live_icon.png');
assert.deepEqual(pngSize(live),{width:256,height:256});
const showcase=await readFile('docs/images/app-icon.png'),favicon=await readFile('web/src/assets/brand/favicon.png'),appleTouch=await readFile('web/src/assets/brand/apple-touch-icon.png');
assert.equal(hash(showcase),hash(live),'GitHub 展示图必须使用同一张 256×256 品牌资源');assert.deepEqual(pngSize(favicon),{width:32,height:32});assert.deepEqual(pngSize(appleTouch),{width:180,height:180});
const corrupt=Buffer.from(native);corrupt[0]^=1;assert.notEqual(hash(brand),hash(corrupt));
assert.throws(()=>pngSize(corrupt));
const css=await readFile('web/src/theme/app.css','utf8');assert.match(css,/\.brand-art\{object-fit:contain;aspect-ratio:1/);
await mkdir('build/evidence',{recursive:true});
await writeFile('build/evidence/assets-results.json',JSON.stringify({materialSymbols:Object.keys(manifest.icons).length,local:true,mutationRejected:true,brandSha256:hash(brand),brand:{...pngSize(brand),originalMatches:true},nativeMatches:true,defaultBackground:{width:941,height:1672,sha256:hash(background),originalMatches:true},liveIcon:{width:256,height:256,sha256:hash(live)},githubIcon:{width:256,height:256,sha256:hash(showcase),liveMatches:true},favicon:{...pngSize(favicon),sha256:hash(favicon)},appleTouchIcon:{...pngSize(appleTouch),sha256:hash(appleTouch)}},null,2));
console.log(`PASS ${Object.keys(manifest.icons).length} 个本地 Material SVG / 变异拒绝 / 用户正式品牌原图和两端图标一致 / 实时通知与GitHub图标一致 / favicon与主屏幕图标尺寸 / 默认背景原图一致 / 等比显示`);
