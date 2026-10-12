/* Standalone guide: no app state, analytics, or external dependencies. */
const root=document.documentElement;
const themeButton=document.querySelector('#theme');
const modes=['system','light','dark'],labels={system:'跟随系统',light:'浅色',dark:'深色'};
let mode='system';
try{const saved=localStorage.getItem('dolphin-import-guide-theme');if(modes.includes(saved))mode=saved;}catch{}
function renderTheme(){if(mode==='system')delete root.dataset.theme;else root.dataset.theme=mode;themeButton.textContent=`主题：${labels[mode]}`;themeButton.setAttribute('aria-label',`当前${labels[mode]}主题，切换教程主题`);}
renderTheme();themeButton.addEventListener('click',()=>{mode=modes[(modes.indexOf(mode)+1)%modes.length];renderTheme();try{localStorage.setItem('dolphin-import-guide-theme',mode);}catch{}});
const promptText=document.querySelector('#prompt-text'),copyButton=document.querySelector('#copy-prompt'),status=document.querySelector('#copy-status');
async function loadPrompt(){try{const response=await fetch('prompt.txt');if(!response.ok)throw new Error('unavailable');const value=await response.text();if(!value.trim()||/<!doctype|<html[\s>]/i.test(value))throw new Error('invalid');promptText.value=value;copyButton.disabled=false;document.querySelector('#prompt-download').hidden=false;}catch{promptText.placeholder='提示词暂时无法加载。请返回应用，在导入课表页面打开 AI 提示词弹框，点击复制提示词。';status.textContent='提示词暂时无法加载，请从应用复制。';}}
void loadPrompt();
copyButton.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(promptText.value);status.textContent='统一提示词已复制，可粘贴到 AI 对话。';}catch{document.querySelector('.prompt-box').open=true;promptText.focus();promptText.select();status.textContent='自动复制未成功，已选中全文。请使用系统复制操作。';}});
async function available(path){try{const response=await fetch(path,{method:'HEAD'});return response.ok&&!response.headers.get('content-type')?.includes('text/html');}catch{return false;}}
function showImage(figure,source,alt){const link=document.createElement('a'),img=document.createElement('img');link.href=source;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${alt}，打开原图放大查看`);img.alt=alt;img.loading='eager';img.src=source;img.addEventListener('load',()=>{figure.hidden=false;});link.append(img);figure.prepend(link);figure.querySelector('figcaption').append(' 点图放大查看。');}
for(const figure of document.querySelectorAll('[data-image]'))void (async()=>{const annotated=figure.dataset.image.replace('-demo.jpg','-step.png');const source=await available(annotated)?annotated:await available(figure.dataset.image)?figure.dataset.image:null;if(!source)return;showImage(figure,source,figure.textContent.trim());})();
void (async()=>{if(!await available('app-import-step.png'))return;showImage(document.querySelector('#app-preview-media'),'app-import-step.png','Dolphin 实际操作：解析合成 JSON 后，核对开学日期、逐节作息和将修改、将保留项，再确认导入。');})();
void (async()=>{if(!await available('import-demo.webm'))return;const video=document.querySelector('#video-media video');video.src='import-demo.webm';video.addEventListener('loadedmetadata',()=>{document.querySelector('#video-media').hidden=false;document.querySelector('#video-pending').hidden=true;});video.addEventListener('error',()=>{document.querySelector('#video-media').hidden=true;document.querySelector('#video-pending').hidden=false;});})();
