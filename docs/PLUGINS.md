# Dolphin Calendar 插件开发与内置接口

适用：Dolphin Calendar **1.5.1 起**，Plugin API **v1**。本文描述实际公开的应用接口。插件是用户主动安装的HTML、CSS、JavaScript代码，可以添加课表展示、主题和数据转换工具。应用原有列表、平铺、搜索、设置、课程编辑、拖动、教材和提醒继续保留。

## 1. 用户安装与恢复

1. 进入 **设置 → 插件管理**，选择本地JSON插件包，或展开“粘贴插件JSON”。
2. 核对名称、作者、版本及申请权限，点击“授权并安装”。此时只保存代码，插件尚未启用。
3. 在已安装项中启用插件；点击“打开插件工具”才在管理页内运行其界面。需要全局配色时，另外主动选择“应用主题”。
4. 工具只显示在插件管理页。退出管理页，或打开课程详情／导入预览，运行界面会卸载；列表、平铺等内置页面不插入插件区域。
5. 点击“关闭插件工具”，或在管理页恢复原主题。停用撤销工具与主题，配置保留；卸载需要确认，并删除该插件专属配置。

同ID包被视为更新：再次展示完整权限，确认后停用该插件并关闭工具／恢复主题，保留专属配置。作者信息由包自行声明，不是作者身份认证。安装、更新和启用均由用户操作；应用没有插件商城、自动下载或后台自动执行机制。

管理页提供“体验内置示例”和示例JSON下载，示例同样经过安装确认。示例涵盖日期导航、课程详情、临时课程过滤、专属存储、主题及文本转换后请求导入预览。

也可从[Pages下载同源示例JSON](https://tequed232.github.io/Dolphin-Calendar/plugins/quiet-week.dolphin-plugin.json)，与应用的示例来自同一份源码；下载后在管理页确认安装。

## 2. 技术栈与边界

| 部分 | 实现 | 插件开发者需要知道的内容 |
| --- | --- | --- |
| 宿主界面 | React 19、TypeScript 5、Vite 7 | 宿主组件不供插件直接修改；插件可以用普通JS或自己编译框架代码 |
| Android | Kotlin、AndroidX WebKit、WebView；Android 8起 | 运行同一份内置Web构建，不需要重新编译APK来安装插件 |
| 课表数据 | `Schedule`／`Course`／`Period`，IndexedDB | 通过授权SDK读取快照，不能直接打开宿主数据库 |
| 插件代码 | 单JSON包，沙箱iframe `srcdoc` | JavaScript在插件自己的文档中运行，CSS作用于插件页面 |
| 通信 | Promise SDK + `postMessage` | 宿主检查当前frame、会话、请求顺序、权限和参数 |
| 插件配置 | 独立IndexedDB `dolphin-calendar-plugins` | 按插件ID隔离，不加入原课表、教材或偏好结构 |
| 原生能力 | 指定HTTPS来源、仅主frame的消息桥 | 插件不取得 `window.Dolphin` 或Android原生调用权 |

插件只有**设置中的管理页面**这一个入口，工具界面在该页按需打开；没有内置课表替换、主页插入或自动显示入口。内置四入口和“关闭插件工具”按钮始终由宿主管理。主题只覆盖公开颜色变量；自定义导入只请求原流程预览。API v1不包含后台任务、任意课程写入、教材图片、通知、系统日历、相机、地图或原生文件操作。作者可以在工具中自行制作课表、统计、格式转换等功能，不需要宿主为每个插件增加产品页面。

运行时、完整类型与示例源码：

- [`plugins.ts`](../web/src/lib/plugins.ts)：包校验、协议、SDK生成及独立存储。
- [`PluginFrame.tsx`](../web/src/components/PluginFrame.tsx)：接口权限与生命周期。
- [`api.d.ts`](../web/src/plugins/api.d.ts)：可复制到插件工程的TypeScript接口。
- [`pluginExample.ts`](../web/src/lib/pluginExample.ts)：完整可安装示例。
- [`PluginState.tsx`](../web/src/state/PluginState.tsx)：安装、启停、更新、主题及配置事务。

## 3. 插件包格式

文件名建议 `my-calendar.dolphin-plugin.json`，内容是一个JSON对象，不是ZIP。所有代码和样式放在字符串字段中，不依赖外部网址。

```json
{
  "manifest": {
    "id": "org.example.my-calendar",
    "name": "我的课表展示",
    "version": "1.0.0",
    "apiVersion": 1,
    "minAppVersion": "1.5.1",
    "author": "你的名字",
    "description": "按所选日期显示课程。",
    "permissions": ["schedule:read"],
    "contributes": {"view": true}
  },
  "html": "<main><h1 id='date'></h1><div id='courses'></div></main>",
  "css": "body{font:16px system-ui;margin:0;padding:16px}article{padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:12px}",
  "javascript": "const sdk=window.DolphinPlugin;async function render(ctx){document.getElementById('date').textContent=ctx.date;const host=document.getElementById('courses');host.replaceChildren();for(const course of await sdk.getCourses(ctx.date)){const card=document.createElement('article');card.textContent=course.name+' · '+(course.room||'教室未填写');host.append(card)}};sdk.ready().then(()=>sdk.onContext(ctx=>{render(ctx).catch(console.error)})).catch(console.error);"
}
```

| 字段 | 必填 | 校验与用途 |
| --- | --- | --- |
| `manifest.id` | 是 | 小写命名空间，80字符内；以字母开头，至少用点或连字符分成两段；同ID用于更新和专属配置 |
| `manifest.name` | 是 | 非空，80字符内 |
| `manifest.version` | 是 | `x.y.z` 三段非负整数，不能使用前导零或预发行后缀 |
| `manifest.apiVersion` | 是 | 本版仅接受数字 `1` |
| `manifest.minAppVersion` | 建议 | `x.y.z`；新插件建议写 `1.5.1`，高于当前应用版本会拒绝安装 |
| `manifest.author` | 否 | 120字符内；由作者提供 |
| `manifest.description` | 否 | 1200字符内 |
| `manifest.permissions` | 是 | 已知权限数组，允许空数组；不接受重复或未知权限 |
| `manifest.contributes.view` | 否 | 布尔值，`true`时在管理页提供“打开插件工具” |
| `manifest.contributes.theme` | 否 | `light`／`dark`颜色映射，需要 `theme:app` |
| `html` | 是 | 插件页面片段，字符串 |
| `css` | 否 | 插件页面CSS字符串 |
| `javascript` | 否 | 浏览器JavaScript字符串；可使用async／await |

无需把代码手动转义为JSON。`javascript`不是ES模块；异步代码放在async函数或async立即执行函数里，不使用顶层await。开发时拆成文件，再用Node生成包：

```js
// pack.mjs；目录包含manifest.json、index.html、styles.css、main.js
import {readFile,writeFile} from 'node:fs/promises';
const read = path => readFile(path,'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const plugin = {manifest,html:await read('index.html'),
  css:await read('styles.css'),javascript:await read('main.js')};
await writeFile('my-calendar.dolphin-plugin.json',JSON.stringify(plugin,null,2));
```

运行 `node pack.mjs`，在管理页安装输出文件即可。使用TypeScript、React等框架时，先编译成浏览器可运行的单文件JavaScript，把依赖也打入包；SDK在插件文档中已提供，不需要另装Dolphin运行库。ES模块`import`和远程CDN不是API v1的加载入口。

## 4. 权限与API总表

全局入口是 **`window.DolphinPlugin`**，不是Android宿主的 `window.Dolphin`。除订阅接口外，均返回Promise。权限在每次宿主调用时校验，修改iframe中的对象不能提高权限。

| 方法 | 权限 | 返回值／行为 |
| --- | --- | --- |
| `ready()` | 无 | `Promise<PluginContext>`；等待初始化握手 |
| `getContext()` | 无 | 当前日期、明暗模式和颜色；仅获读权限时包含`schedule` |
| `onContext(callback)` | 无 | 立即提供已就绪上下文，随后推送日期、课表和主题变化；返回取消订阅函数 |
| `getTheme()` | 无 | `{mode,tokens}` |
| `getSchedule()` | `schedule:read` | 当前完整`Schedule`快照 |
| `getCourses(date?)` | `schedule:read` | 对应日期真实上课的`Course[]`，默认所选日期；沿用宿主单双周／临时课程规则及排序 |
| `selectDate(date)` | `navigation:date` | 更新宿主所选日期，成功返回`null` |
| `openCourse(courseId)` | `course:open` | 打开既有课程详情，成功返回`null`；可配合课表读权限取得ID |
| `requestImport(json)` | `schedule:import` | 交给既有导入流程；成功返回`{previewRequested:true}`，**不表示已经保存** |
| `loadData()` | `storage:local` | 插件自己的JSON值；尚未保存时为`null` |
| `saveData(value)` | `storage:local` | 覆盖该插件自己的JSON配置，落库成功才返回`null` |
| 声明应用主题 | `theme:app` | 用户在管理页选择后应用manifest配色；无任意宿主CSS写入接口 |

`onContext`不返回Promise。回调应处理自身异步异常，例如 `context => void render(context).catch(showError)`。`ready()`之后开始工作，避免访问尚未完成握手的数据。

## 5. 日期、课表与课程详情

```js
const sdk = window.DolphinPlugin;
const context = await sdk.ready();
const schedule = await sdk.getSchedule();
const courses = await sdk.getCourses(context.date);
await sdk.selectDate('2026-10-13');
if(courses[0]) await sdk.openCourse(courses[0].id);
```

日期严格使用1900–9999年内合法的`YYYY-MM-DD`，不是时间戳，非法年月日会拒绝。`day`为周一1至周日7；`start`／`end`为从1开始的闭区间节次；`weeks`为实际授课周数数组，单双周应展开成实际周次。周次从开学日期所在周的周一计算。

```ts
interface Schedule {
  term: {name:string;startDate:string;weeks:number};
  periods: Array<{start:string;end:string;label?:string;
    breakAfter?:{label:string;start:string;end:string}}>;
  courses: Array<{id:string;name:string;teacher:string;room:string;
    day:number;start:number;end:number;weeks:number[];color:string;notes:string;
    temporary?:boolean;specificDate?:string}>;
  importNotes?:string[];
}
```

逐节时间从`periods[course.start-1]`及`periods[course.end-1]`读取，不要把连堂总时段平均拆分。使用`getCourses`可复用已有临时日期、单双周和学期过滤，不必复制模型逻辑。

快照可以在插件中排序或计算统计，但修改快照不会修改宿主数据。课程ID是已有课程详情的定位符，不能用显示名称替代。显示用户提供的课程名／备注时使用`textContent`或框架的文本绑定，避免拼成可执行HTML。

## 6. 主题自定义

插件自己的CSS只作用于插件文档。宿主颜色通过`getTheme`／`onContext`提供，插件需要主动应用变量：

```js
const stop = window.DolphinPlugin.onContext(context => {
  document.documentElement.dataset.mode = context.mode;
  for(const [name,color] of Object.entries(context.tokens)) {
    document.documentElement.style.setProperty(name,color);
  }
});
// 页面销毁前可调用 stop()；宿主卸载frame时也会清理其所有脚本。
```

全局主题使用声明，而不是调用宿主DOM。示例manifest部分：

```json
{
  "permissions": ["theme:app"],
  "contributes": {
    "theme": {
      "light": {"--accent":"#516D56","--canvas":"#F4F6F1","--ink":"#182C2D"},
      "dark": {"--accent":"#BDD6BD","--canvas":"#141A16","--ink":"#E3ECE5"}
    }
  }
}
```

支持的变量：

- 基础颜色：`--canvas`、`--surface`、`--input`、`--ink`、`--muted`、`--accent`、`--on-accent`、`--accent-soft`、`--soft`、`--line`、`--line-strong`、`--danger`。
- 课程配色：`--sage`／`--sage-ink`／`--sage-line`，以及同结构的`lavender`、`peach`、`blue`、`rose`。

仅接受3／4／6／8位十六进制颜色，不能注入CSS语句、URL、布局尺寸或系统安全区变量。未声明的颜色沿用原主题。浅深色按用户原模式切换；某个模式未提供配色时，该模式沿用内置颜色。全局主题不会覆盖用户的背景图片、字号、提醒或动态取色偏好。停用／卸载／恢复原主题会移除插件颜色层。

## 7. 自定义导入转换

插件可提供文本框或文件选择，把自己的格式转换成标准课表对象。调用`requestImport`后，由宿主现有解析器进行校验、展示修改／保留内容，并等待用户确认。

```js
// 示例格式：课程名称 | 星期 | 开始节次 | 结束节次 | 实际周次
// 单节与连堂都保留输入边界；不推测缺失的开学日期或作息。
async function convert(text) {
  const sdk = window.DolphinPlugin;
  const current = await sdk.getSchedule();
  const courses = text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [name,day,start,end,weeks] = line.split('|').map(v=>v.trim());
    if(!name||!day||!start||!end||!weeks) throw new Error('请补齐所有字段');
    return {name,teacher:'',room:'',day:Number(day),start:Number(start),
      end:Number(end),weeks:weeks.split(',').map(Number),notes:''};
  });
  await sdk.requestImport({term:current.term,periods:current.periods,courses});
}
```

这个插件需要`schedule:read`及`schedule:import`。如独立提供了完整学期和作息，也可只申请导入权限。对象或JSON字符串均可传入；JSON语法无效时接口拒绝，结构／课程／时间不合法时宿主导入页显示错误，旧课表保持。用户取消预览不会写数据；确认导入后沿用原流程更新课表并保留教材、背景与偏好。

原CSV／Excel／JSON入口、AI提示词和预览界面不被插件覆盖。复杂CSV带引号或Excel转换应使用插件自己打包的解析库，不要用简单split冒充通用解析。调用导入会离开插件工具，插件frame将卸载；不要把该Promise当作“用户已确认保存”的通知。

## 8. 专属配置与生命周期

```js
const sdk = window.DolphinPlugin;
await sdk.ready();
const previous = await sdk.loadData();
await sdk.saveData({schema:1,compact:previous?.compact??true});
```

配置限于JSON值，可以是对象、数组、字符串、数字、布尔值或`null`。不支持函数、循环对象、DOM节点、`undefined`或`BigInt`。每次`saveData`覆盖整个配置；同插件多次写入按顺序保存，成功落库才返回。保存失败会拒绝Promise，保留原配置，不改课表数据库。不同插件不能指定别人的ID读写。

生命周期为：安装（不执行）→ 启用 → 用户打开管理页内工具 → 页面就绪 → SDK握手 → 运行。离开管理页、打开导入／详情、停用、更新或卸载会卸载frame；再次主动打开工具时重新初始化。需要保留的状态应写入专属配置，不能依赖页面全局变量长期存在。主题是声明层，不需要运行JavaScript。

运行错误或启动超时会显示宿主错误卡片，可重新加载；“关闭插件工具”按钮位于插件外部。卸载会清专属配置，更新保留配置但停用，插件开发者应为自己配置增加`schema`并实现迁移。

## 9. 限额、错误和隔离边界

| 项目 | 上限／规则 |
| --- | --- |
| 单插件包 | 2 MiB，按UTF-8字节 |
| 单插件配置 | 256 KiB，JSON序列化后的UTF-8字节 |
| 单次导入 | 3 MiB |
| 安装数量 | 20个 |
| 插件库总量 | 12 MiB，包含包、配置和状态 |
| SDK速率 | 每插件运行会话60请求／秒 |
| SDK并发 | 8个尚未完成请求 |
| 请求等待 | 15秒；启动握手10秒 |
| 原生插件支持 | WebView支持`WEB_MESSAGE_LISTENER`；旧WebView保留内置功能但拒绝运行插件代码 |

接口失败通过Promise拒绝返回。开发者应把`error.message`显示在插件内，避免未处理异常停止运行。超时并不等于已发出的宿主事务被撤销，例如已开始的配置写入可能稍后完成；再次调用前先读取状态。

插件是用户选择执行的代码，只安装信任来源。iframe不允许同源访问、弹窗和顶级导航，常用fetch／WebSocket／外链资源由CSP限制；Android也限制插件子frame的外部请求和原生桥访问。浏览器对iframe自身导航的限制并不等同于网络防火墙，不能把任意恶意HTML／JavaScript视作绝对零网络；获准读课表的代码能看到这些课程信息。隔离也不是CPU配额，代码应避免死循环、大量DOM、频繁布局和无界动画。

主题与插件配置不进入现有“导出课表JSON”，卸载应用／清除浏览器数据会删除插件库。保留自己的插件包和需要的配置副本；本版尚未提供插件配置导出接口或远程插件仓库。

## 10. 开发、测试和发布

1. 下载示例，复制API类型，按最小权限修改manifest。
2. 在隔离浏览器或调试APK中使用虚构课表，安装新包，确认权限并启用。
3. 测试浅色／深色、320px小屏、横屏、135%字号、长课程名、无课日、临时课、单双周和跨节课程。
4. 测试停用、更新、卸载、配置恢复、接口拒绝／保存失败，以及导入预览的取消与确认。
5. 测试离开管理页后列表／平铺／搜索没有插件界面，内置课程详情和编辑仍正常；工具关闭按钮必须始终可用。
6. 发布JSON包、源码、版本说明及许可证。变更包用同ID和更高版本，新增权限必须说明用途。

浏览器开发工具中选择插件frame查看console。Android仅Debug APK开放WebView调试，可以通过Chrome的远程设备工具观察实际`appassets`内置页面；使用Vite不能替代安装包验证。更新代码时重新安装同ID包，再启用并主动打开插件工具，不会自动热替换运行代码。

宿主验证入口：`npm run check`、`npm run build`、`node scripts/ci.mjs`。新增插件相关回归分别见`check-plugins.test.ts`、`check-plugins-ui.mjs`及发行验证记录。

## 11. 设计参考与兼容

本项目借鉴开源项目的manifest版本／最低版本声明、管理页启停、隔离运行和异步SDK组织方式，协议与课表接口由Dolphin Calendar独立实现，不兼容它们现有插件包：

- [Joplin 插件开发](https://joplinapp.org/api/get_started/plugins/)、[Manifest说明](https://joplinapp.org/help/api/references/plugin_manifest/)、[插件架构](https://joplinapp.org/help/dev/spec/plugins/)。
- [Logseq 官方插件SDK](https://logseq.github.io/plugins/)、[官方入门指南](https://github.com/logseq/logseq/blob/master/libs/guides/starter_guide.md)。

API `apiVersion`与应用发行版本分别管理。新增兼容方法可继续使用v1；破坏性协议变更使用新API版本，旧包不会被静默当作新协议执行。本文和仓库对应的类型、示例及测试共同定义本版支持范围。
