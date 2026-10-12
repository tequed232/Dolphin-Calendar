import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath=fileURLToPath(import.meta.url);
const defaultPolicy=path.resolve(path.dirname(scriptPath),'../source-policy.json');

function glob(pattern){
  let regex='^';
  for(let i=0;i<pattern.length;i++){
    const c=pattern[i];
    if(c==='*'&&pattern[i+1]==='*'){
      i++;if(pattern[i+1]==='/'){i++;regex+='(?:.*/)?';}else regex+='.*';
    }else if(c==='*')regex+='[^/]*';
    else if(c==='?')regex+='[^/]';
    else regex+=c.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&');
  }
  return new RegExp(regex+'$','i');
}
function preparePolicy(raw){
  if(raw.version!==1)throw new Error('不支持的 source-policy.json 版本');
  for(const key of ['allowedPaths','allowedPatterns','allowedBinaryPaths','deniedDirectoryNames','deniedFileNames','deniedPatterns','legacyTrackedPatterns','requiredPaths']){
    if(!Array.isArray(raw[key])||raw[key].some(value=>typeof value!=='string'||!value))throw new Error(`规则字段 ${key} 必须是非空字符串数组`);
  }
  const resources=new Map();
  for(const resource of raw.binaryResources??[]){
    if(!resource||!raw.allowedPaths.includes(resource.path)||!['video/webm','image/jpeg','image/png'].includes(resource.mime)||!Number.isSafeInteger(resource.maxBytes)||resource.maxBytes<=0||resources.has(resource.path.toLowerCase()))throw new Error('二进制教程资源必须逐路径声明 MIME 与最大字节数');
    if(resource.mime==='video/webm'&&!resource.path.endsWith('.webm')||resource.mime==='image/jpeg'&&!resource.path.endsWith('.jpg')||resource.mime==='image/png'&&!resource.path.endsWith('.png'))throw new Error('教程资源路径扩展名与 MIME 不一致');
    resources.set(resource.path.toLowerCase(),resource);
  }
  return {...raw,allowed:new Set(raw.allowedPaths.map(value=>value.toLowerCase())),binary:new Set(raw.allowedBinaryPaths.map(value=>value.toLowerCase())),
    directories:new Set(raw.deniedDirectoryNames.map(value=>value.toLowerCase())),names:new Set(raw.deniedFileNames.map(value=>value.toLowerCase())),
    allow:raw.allowedPatterns.map(glob),deny:raw.deniedPatterns.map(glob),legacy:raw.legacyTrackedPatterns.map(glob),resources};
}
function resourceError(bytes,resource){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>resource.maxBytes)return '教程媒体为空或超过逐文件大小上限';
  if(resource.mime==='image/jpeg')return bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9?null:'教程 JPEG 起止标记不符合 image/jpeg';
  if(resource.mime==='image/png')return bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))&&bytes.subarray(12,16).toString('ascii')==='IHDR'&&bytes.subarray(-12).equals(Buffer.from([0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]))?null:'教程 PNG 文件头或 IEND 结尾无效';
  // EBML header and a WebM DocType in that header identify the single allowed
  // recording. A renamed ZIP/APK or generic Matroska file must not pass.
  if(bytes.length<12||!bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return '教程 WebM 缺少 EBML 魔数';
  let length=1,mask=0x80;while(length<=8&&!(bytes[4]&mask)){length++;mask>>=1;}
  if(length>8||bytes.length<5+length)return '教程 WebM EBML 头长度无效';
  let size=BigInt(bytes[4]&(~mask&0xff));for(let i=1;i<length;i++)size=size*256n+BigInt(bytes[4+i]);
  if(size>4096n||size===0n||size>BigInt(bytes.length-4-length))return '教程 WebM EBML 头范围无效';
  const header=bytes.subarray(4+length,4+length+Number(size)),docType=Buffer.from([0x42,0x82,0x84,0x77,0x65,0x62,0x6d]);
  return header.includes(docType)?null:'教程媒体 DocType 不是 video/webm';
}
function pathError(name,policy){
  if(!name||name.includes('\\')||name.startsWith('/')||/[\x00-\x1f\x7f:]/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))return '路径不适合跨平台源码仓库';
  const parts=name.split('/'),lower=name.toLowerCase();
  if(parts.some(part=>/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(part)))return 'Windows 保留设备名称禁止入库';
  if(parts.slice(0,-1).some(part=>policy.directories.has(part.toLowerCase())))return '构建、缓存、IDE、签名或仓库内部目录禁止入库';
  if(policy.names.has(parts.at(-1).toLowerCase()))return '本机配置、凭据或数据库文件禁止入库';
  if(policy.deny.some(rule=>rule.test(name))&&!policy.binary.has(lower))return '发行包、归档、密钥、数据库、生成资源或原始提示词禁止入库';
  if(!policy.allowed.has(lower)&&!policy.allow.some(rule=>rule.test(name)))return '文件不在源码准入允许列表中';
  return null;
}
function git(root,args,{env=process.env,input}={}){
  const result=spawnSync('git',['-C',root,...args],{env,input,encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`git ${args[0]} 失败：${result.stderr.trim()}`);
  return result.stdout;
}
function gitRoot(directory){
  const result=spawnSync('git',['-C',directory,'rev-parse','--show-toplevel'],{encoding:'utf8'});
  return result.status===0?path.resolve(result.stdout.trim()):null;
}
function parseEntries(output){
  return output.split('\0').filter(Boolean).map(line=>{
    const tab=line.indexOf('\t'),header=line.slice(0,tab).split(' ');
    if(tab<0)throw new Error('无法解析 Git 文件条目');
    const treeEntry=['blob','tree','commit'].includes(header[1]);
    return {name:line.slice(tab+1),mode:header[0],oid:treeEntry?header[2]:header[1],unmerged:!treeEntry&&header.length===3&&/^\d+$/.test(header[2])&&header[2]!=='0'};
  });
}
function indexed(root,staged){
  const entries=parseEntries(git(root,['ls-files','--stage','-z']));
  if(!staged)return entries;
  const changed=new Set(git(root,['diff','--cached','--name-only','--diff-filter=ACMRU','-z']).split('\0').filter(Boolean));
  return entries.filter(entry=>changed.has(entry.name));
}
function committed(root,ref){
  if(ref.startsWith('-'))throw new Error('提交引用不能以 - 开头');
  const revision=git(root,['rev-parse','--verify',`${ref}^{commit}`]).trim();
  return parseEntries(git(root,['ls-tree','-r','-z','--full-tree',revision]));
}
function walk(directory){
  const entries=[];
  function visit(current,prefix=''){
    for(const item of readdirSync(current,{withFileTypes:true})){
      // 根 .git 是 Git 管理数据；嵌套 .git 仍作为违规条目检查。
      if(!prefix&&item.name==='.git')continue;
      const name=prefix+item.name,full=path.join(current,item.name),stat=lstatSync(full);
      if(stat.isSymbolicLink()){entries.push({name,mode:'120000'});continue;}
      if(stat.isDirectory())visit(full,name+'/');
      else if(stat.isFile())entries.push({name,mode:'100644'});
      else entries.push({name,mode:'unsupported'});
    }
  }
  visit(directory);return entries;
}
function validate(entries,policy,{legacy=new Set(),required=false,worktree,readContent,fullEntries=entries}={}){
  const errors=[],warnings=[],names=new Set();
  const paths=new Map();
  for(const entry of fullEntries){
    const parts=entry.name.split('/');
    for(let i=1;i<=parts.length;i++){
      const prefix=parts.slice(0,i).join('/'),key=prefix.toLowerCase(),previous=paths.get(key);
      if(previous&&previous!==prefix)errors.push(`${entry.name}：路径大小写冲突（${previous} / ${prefix}）`);
      else paths.set(key,prefix);
    }
  }
  for(const entry of entries){
    names.add(entry.name);let reason=pathError(entry.name,policy);
    if(entry.unmerged)reason='Git 索引存在未解决的合并条目';
    if(!['100644','100755'].includes(entry.mode))reason='符号链接、子模块或特殊文件禁止进入发布源码';
    if(worktree&&!reason){
      const file=path.join(worktree,...entry.name.split('/'));
      if(!existsSync(file))reason='已跟踪源码在工作树中缺失';
      else if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())reason='工作树中的源码必须是普通文件';
    }
    if(!reason&&policy.resources.has(entry.name.toLowerCase())){
      try{
        if(!readContent&&!worktree)reason='教程媒体必须从实际源码快照读取内容';
        else reason=resourceError(readContent?readContent(entry):readFileSync(path.join(worktree,...entry.name.split('/'))),policy.resources.get(entry.name.toLowerCase()));
      }catch(error){reason='无法读取教程媒体内容：'+error.message;}
    }
    if(reason){
      if(legacy.has(entry.name)&&policy.legacy.some(rule=>rule.test(entry.name))&&!entry.unmerged&&['100644','100755'].includes(entry.mode))warnings.push(entry.name);
      else errors.push(`${entry.name}：${reason}`);
    }
  }
  if(required)for(const name of policy.requiredPaths)if(!names.has(name))errors.push(`${name}：发布源码缺少必需文件`);
  return {errors,warnings,count:entries.length};
}
function argumentsFor(argv){
  const options={mode:'auto',strict:Boolean(process.env.CI)&&process.env.CI!=='false',directory:process.cwd(),policy:defaultPolicy};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--strict')options.strict=true;
    else if(arg==='--paths-only')options.pathsOnly=true;
    else if(['--staged','--tracked','--self-test'].includes(arg)){if(options.mode!=='auto')throw new Error('检查模式不能组合');options.mode=arg.slice(2);}
    else if(['--directory','--policy','--ref'].includes(arg)){
      const value=argv[++i];if(!value||value.startsWith('--'))throw new Error(`${arg} 缺少参数`);
      if(arg==='--policy')options.policy=path.resolve(value);
      else if(arg==='--directory'){if(options.mode!=='auto')throw new Error('检查模式不能组合');options.mode='directory';options.directory=path.resolve(value);}
      else{if(options.mode!=='auto')throw new Error('检查模式不能组合');options.mode='ref';options.ref=value;options.strict=true;}
    }else throw new Error(`未知参数 ${arg}`);
  }
  return options;
}
function report(result,label){
  for(const warning of result.warnings.slice(0,20))console.warn(`历史排除项（仅本地默认检查放行）：${warning}`);
  for(const error of result.errors.slice(0,30))console.error(`拒绝 ${error}`);
  if(result.errors.length>30)console.error(`另有 ${result.errors.length-30} 个拒绝项`);
  if(result.errors.length)console.error(`源码准入失败：${label}，检查 ${result.count} 个文件，${result.errors.length} 个问题。`);
  else console.log(`源码准入通过：${label}，检查 ${result.count} 个文件${result.warnings.length?`，${result.warnings.length} 个历史排除项必须从新快照排除`:''}。`);
  return result.errors.length?1:0;
}
function selfTest(policy){
  let checks=0;
  const test=(condition,name)=>{if(!condition)throw new Error(`准入规则自检失败：${name}`);checks++;console.log(`PASS ${name}`);};
  for(const name of ['web/src/main.tsx','web/src/assets/brand/app-icon.png','app/src/main/res/drawable/ic_notification.xml','legal/APACHE-2.0.txt','gradle/wrapper/gradle-wrapper.jar','.githooks/pre-commit'])test(!pathError(name,policy),`允许 ${name}`);
  for(const name of ['docs/import-guide/index.html','docs/import-guide/guide.css','docs/import-guide/guide.js','docs/import-guide/import-demo.webm','docs/import-guide/chatgpt-demo.jpg','docs/import-guide/deepseek-demo.jpg'])test(!pathError(name,policy),`允许逐路径教程资源 ${name}`);
  for(const name of ['docs/import-guide/other.webm','web/src/assets/other.webm','docs/images/other.mp4','docs/import-guide/other.jpg','docs/import-guide/prompt.txt','docs/import-guide/schedule.csv','docs/import-guide/schedule.json','web/public/import-guide/import-demo.webm','app/src/main/assets/web/import-guide/import-demo.webm'])test(Boolean(pathError(name,policy)),`拒绝未授权教程或生成资源 ${name}`);
  const video=policy.resources.get('docs/import-guide/import-demo.webm'),jpeg=policy.resources.get('docs/import-guide/chatgpt-demo.jpg');
  const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0x87,0x42,0x82,0x84,0x77,0x65,0x62,0x6d]),image=Buffer.from([0xff,0xd8,0xff,0xe0,0xff,0xd9]);
  test(!resourceError(webm,video),'唯一 WebM 的 EBML 与 DocType 通过');
  test(Boolean(resourceError(Buffer.from('PK synthetic archive'),video)),'改名为 WebM 的 ZIP 被拒绝');
  test(Boolean(resourceError(Buffer.from('MZ synthetic executable'),video)),'改名为 WebM 的可执行文件被拒绝');
  test(Boolean(resourceError(Buffer.from([0x1a,0x45,0xdf,0xa3,0x88,0x42,0x82,0x85,0x6f,0x74,0x68,0x65,0x72]),video)),'非 WebM DocType 被拒绝');
  test(Boolean(resourceError(Buffer.concat([webm.subarray(0,4),Buffer.from([0xff]),webm.subarray(5)]),video)),'损坏 EBML 头范围被拒绝');
  test(Boolean(resourceError(Buffer.alloc(video.maxBytes+1),video)),'WebM 超过逐文件大小上限被拒绝');
  test(!resourceError(image,jpeg),'逐路径 JPEG 起止标记通过');
  test(Boolean(resourceError(Buffer.from('not a jpeg'),jpeg)),'改名为 JPEG 的文字被拒绝');
  test(Boolean(resourceError(Buffer.concat([image,Buffer.from('payload')]),jpeg)),'JPEG 末尾追加载荷被拒绝');
  const pngResource=policy.resources.get('docs/import-guide/app-import-step.png'),png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52]),Buffer.alloc(17),Buffer.from([0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82])]);
  test(!resourceError(png,pngResource),'逐路径 PNG 文件头与 IEND 通过');test(Boolean(resourceError(Buffer.from('not png'),pngResource)),'改名为 PNG 的文字被拒绝');test(Boolean(resourceError(Buffer.concat([png,Buffer.from('payload')]),pngResource)),'PNG 末尾追加载荷被拒绝');
  for(const name of ['app-debug.apk','docs/images/app.zip','web/src/unsafe.jar','app/build/source.kt','web/node_modules/source.ts','app/src/main/assets/web/index.html','.idea/misc.xml','.run/run.xml','signing.local.properties','web/src/config.key','web/src/state.sqlite-wal','Dolphin Calendar全量提示词.txt'])test(Boolean(pathError(name,policy)),`拒绝 ${name}`);
  for(const name of ['legal/Dolphin Calendar全量提示词.txt','web/src/con.ts','web/src/AUX.json','web/src/COM1.ts'])test(Boolean(pathError(name,policy)),`拒绝 ${name}`);
  test(validate([{name:'web/src/Foo.ts',mode:'100644'},{name:'web/src/foo.ts',mode:'100644'}],policy).errors.some(error=>error.includes('大小写冲突')),'拒绝文件名大小写冲突');
  test(validate([{name:'web/src/Folder/a.ts',mode:'100644'},{name:'web/src/folder/b.ts',mode:'100644'}],policy).errors.some(error=>error.includes('大小写冲突')),'拒绝目录大小写冲突');
  const temp=mkdtempSync(path.join(os.tmpdir(),'dolphin-source-policy-'));
  try{
    git(temp,['init','--quiet']);
    const env={...process.env,GIT_INDEX_FILE:path.join(temp,'test-index')};
    const blob=git(temp,['hash-object','-w','--stdin'],{env,input:'// 合成测试源码\n'}).trim();
    const add=(name,mode='100644')=>git(temp,['update-index','--add','--cacheinfo',mode,blob,name],{env});
    const readContent=entry=>{const result=spawnSync('git',['-C',temp,'cat-file','blob',entry.oid],{env,maxBuffer:32*1024*1024});if(result.status!==0)throw new Error('测试 blob 读取失败');return result.stdout;};
    const staged=()=>{
      const entries=parseEntries(git(temp,['ls-files','--stage','-z'],{env}));
      const changes=new Set(git(temp,['diff','--cached','--name-only','--diff-filter=ACMRU','-z'],{env}).split('\0').filter(Boolean));
      return validate(entries.filter(entry=>changes.has(entry.name)),policy,{readContent});
    };
    add('web/src/index-only.ts');test(staged().errors.length===0&&!existsSync(path.join(temp,'web/src/index-only.ts')),'真实临时索引中的源码可通过，未依赖工作树文件');
    add('app-debug.apk');test(staged().errors.some(error=>error.startsWith('app-debug.apk：')),'真实临时索引拒绝已暂存 APK');
    git(temp,['update-index','--force-remove','app-debug.apk'],{env});test(staged().errors.length===0,'删除禁入索引条目后可以提交');
    const media='docs/import-guide/import-demo.webm';
    const validBlob=git(temp,['hash-object','-w','--stdin'],{env,input:webm}).trim();
    git(temp,['update-index','--add','--cacheinfo','100644',validBlob,media],{env});test(staged().errors.length===0,'真实索引允许唯一有效 WebM，未依赖工作树文件');
    // The source-of-truth is the staged blob, even if a different worktree copy exists.
    const mediaFile=path.join(temp,...media.split('/'));mkdirSync(path.dirname(mediaFile),{recursive:true});writeFileSync(mediaFile,'invalid worktree media');test(staged().errors.length===0,'有效暂存媒体不被不同工作树副本替代');
    writeFileSync(mediaFile,webm);git(temp,['update-index','--add','--cacheinfo','100644',blob,media],{env});test(staged().errors.some(error=>error.startsWith(media+'：')),'有效工作树媒体不能掩盖实际索引中的伪装 WebM');
    git(temp,['update-index','--add','--cacheinfo','100644',validBlob,media],{env});const tree=git(temp,['write-tree'],{env}).trim(),commit=git(temp,['-c','user.name=Source policy test','-c','user.email=test@example.invalid','commit-tree',tree],{env,input:'synthetic media commit\n'}).trim();writeFileSync(mediaFile,'invalid worktree media');test(validate(committed(temp,commit),policy,{readContent}).errors.length===0,'真实提交树读取有效媒体 blob，忽略不同工作树副本');
    git(temp,['update-index','--force-remove',media],{env});
    const jpg='docs/import-guide/chatgpt-demo.jpg',jpgBlob=git(temp,['hash-object','-w','--stdin'],{env,input:image}).trim();git(temp,['update-index','--add','--cacheinfo','100644',jpgBlob,jpg],{env});test(staged().errors.length===0,'真实索引允许逐路径有效 JPEG');
    git(temp,['update-index','--add','--cacheinfo','100644',blob,jpg],{env});test(staged().errors.some(error=>error.includes('JPEG')),'真实索引拒绝伪装 JPEG');git(temp,['update-index','--force-remove',jpg],{env});
    add('web/src/link.ts','120000');test(staged().errors.some(error=>error.includes('符号链接')),'真实临时索引拒绝伪装为源码的 symlink');
    writeFileSync(path.join(temp,'README.md'),'# 合成源码快照\n');writeFileSync(path.join(temp,'payload.zip'),'synthetic archive');
    test(validate(walk(temp),policy).errors.some(error=>error.startsWith('payload.zip：')),'独立目录扫描拒绝归档文件');
    test(validate([{name:'.idea/new.xml',mode:'100644'}],policy,{legacy:new Set()}).errors.length===1,'新增 IDE 文件不能获得历史豁免');
    test(validate([{name:'.idea/misc.xml',mode:'100644'}],policy,{legacy:new Set(['.idea/misc.xml'])}).warnings.length===1,'本地默认检查只警告已知历史 IDE 文件');
    test(validate([{name:'.idea/misc.xml',mode:'100644'}],policy).errors.length===1,'严格提交树检查拒绝历史 IDE 文件');
  }finally{
    const verified=path.resolve(temp),prefix=path.resolve(os.tmpdir())+path.sep;
    if(!verified.startsWith(prefix)||!path.basename(verified).startsWith('dolphin-source-policy-'))throw new Error('拒绝清理未经核对的自检目录');
    rmSync(verified,{recursive:true,force:true});
  }
  console.log(`源码准入自检通过：${checks} 项。`);return 0;
}
function main(){
  const options=argumentsFor(process.argv.slice(2)),policy=preparePolicy(JSON.parse(readFileSync(options.policy,'utf8')));
  if(options.mode==='self-test')return selfTest(policy);
  const root=gitRoot(options.directory);
  if(options.mode==='directory'||(options.mode==='auto'&&!root))return report(validate(walk(options.directory),policy,{required:true,worktree:options.directory}),'完整源码目录');
  if(!root)throw new Error('staged / tracked / ref 检查要求处于 Git 仓库中；快照请使用 --directory');
  const readContent=entry=>{const result=spawnSync('git',['-C',root,'cat-file','blob',entry.oid],{maxBuffer:32*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw new Error('Git blob 读取失败');return result.stdout;};
  if(options.mode==='ref'||(options.mode==='auto'&&options.strict))return report(validate(committed(root,options.ref??'HEAD'),policy,{required:!options.pathsOnly,readContent}),'严格提交树');
  if(options.mode==='staged')return report(validate(indexed(root,true),policy,{fullEntries:indexed(root,false),readContent}),'暂存索引新增与修改项');
  const entries=indexed(root,false),legacy=new Set();
  if(!options.strict){
    const head=spawnSync('git',['-C',root,'ls-tree','-r','-z','--full-tree','HEAD'],{encoding:'utf8'});
    if(head.status===0)for(const entry of parseEntries(head.stdout))if(policy.legacy.some(rule=>rule.test(entry.name)))legacy.add(entry.name);
  }
  return report(validate(entries,policy,{legacy,required:options.strict,worktree:root}),options.strict?'严格已跟踪工作树':'已跟踪工作树');
}
try{process.exitCode=main();}catch(error){console.error(`源码准入检查失败：${error.message}`);process.exitCode=1;}
