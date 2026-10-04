const fs=require('node:fs'),path=require('node:path');
const folder=path.join(process.env.APPDATA,'JetBrains/IntelliJIdea2026.2/options');
const file=path.join(folder,'jdk.table.xml');
const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'<application>\n  <component name="ProjectJdkTable">\n  </component>\n</application>\n';
if(!original.includes('Dolphin JDK 17')){
  if(!original.includes('<component name="ProjectJdkTable">'))throw new Error('IDEA SDK 表结构不符合预期，未修改');
  const record=`\n    <jdk version="2"><name value="Dolphin JDK 17"/><type value="JavaSDK"/><version value="java version &quot;17.0.2&quot;"/><homePath value="D:/Android/jdk-17"/><roots><annotationsPath><root type="composite"/></annotationsPath><classPath><root type="composite">${fs.readdirSync('D:/Android/jdk-17/jmods').filter(f=>f.endsWith('.jmod')).map(f=>`<root url="jrt://D:/Android/jdk-17!/${f.slice(0,-5)}" type="simple"/>`).join('')}</root></classPath><javadocPath><root type="composite"/></javadocPath><sourcePath><root type="composite"><root url="jar://D:/Android/jdk-17/lib/src.zip!/" type="simple"/></root></sourcePath></roots><additional/></jdk>\n`;
  fs.mkdirSync('build/ide-backup',{recursive:true});fs.writeFileSync('build/ide-backup/jdk.table.xml',original);
  fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,original.replace('<component name="ProjectJdkTable">','<component name="ProjectJdkTable">'+record));
}
if(original.includes('Dolphin JDK 17')&&original.includes('17.0.12'))fs.writeFileSync(file,original.replace('17.0.12','17.0.2'));
console.log('IDEA 项目使用 JDK 17 / Gradle Kotlin DSL；Kotlin 插件已内置。');
