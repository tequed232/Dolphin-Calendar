const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const properties='signing.local.properties',folder=path.resolve('.signing'),key=path.join(folder,'dolphin-release.jks');
if(fs.existsSync(properties)){if(!fs.existsSync(key))throw new Error('签名配置存在但密钥缺失，拒绝生成不同的发行身份');console.log('已存在稳定的本地发行签名。');process.exit(0);}
if(fs.existsSync(key))throw new Error('密钥存在但配置缺失，请恢复原始签名配置');
fs.mkdirSync(folder,{recursive:true});const password=crypto.randomBytes(24).toString('base64url');
const env={...process.env,DOLPHIN_KEY_PASSWORD:password};
const result=spawnSync(path.join(process.env.JAVA_HOME??'D:/Android/jdk-17','bin/keytool.exe'),['-genkeypair','-keystore',key,'-alias','dolphin','-storetype','JKS','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Dolphin Calendar, OU=Local Development, O=Dolphin Calendar, C=CN','-storepass:env','DOLPHIN_KEY_PASSWORD','-keypass:env','DOLPHIN_KEY_PASSWORD'],{env,encoding:'utf8'});
if(result.status!==0)throw new Error('发行签名生成失败：'+result.stderr);
fs.writeFileSync(properties,`storeFile=.signing/dolphin-release.jks\nstorePassword=${password}\nkeyAlias=dolphin\nkeyPassword=${password}\n`);
console.log('已生成本地发行签名，密钥和配置不会进入 Git 或源码包；请另行安全备份。');
