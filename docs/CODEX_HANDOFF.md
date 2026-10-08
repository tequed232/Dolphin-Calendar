# Dolphin Calendar · Codex 开发交接

更新日期：2026-10-08。此文档对应本次 1.4.3 开发快照，不代表这些改动已经进入线上 Release。

## 接手时先做什么

1. 阅读本文件、README.md、docs/DEVELOPMENT_UPGRADE.md、docs/NAVIGATION_INTERACTION.md、docs/SOURCE_POLICY.md。
2. 在现有项目继续开发，不新建独立项目。先检查 `git status` 和本地改动，禁止 reset/clean 覆盖用户成果。
3. 本次源码包包含工作区最新已跟踪及未跟踪源码；不是仅导出 HEAD。原仓库分支 `work`，基准提交 `7f2a65766ee59f3c1c9e71c2d5b53a38f20a7fb4`；累计功能改动尚未提交。源码 ZIP 不含 .git，接手已有仓库时请先比较文件再合并，不盲目覆盖。
4. 先复现下述检查，再处理实机待验证项。版本号仍为 1.4.3，正式发版前由维护者决定新版本号、签名和发布动作。

## 产品约束与已确定的交互

- 保持原 App 的圆角、玻璃背景、苍绿色强调色和 Dock 设计语言，避免无关大改版。
- 点击课程查看；长按进入布局编辑。不要改成点击即拖动。仅一个课程显示上下两个纵向 Resize Handle；主体拖动移动课程。
- 列表 / 平铺是一级导航，共用课表和语义视觉焦点。切换保留课程、日期和节次，退出编辑但保留焦点，不同步原始像素 offset，不重新解析数据。
- 主页快捷操作为更新提示（有新版本才显示）、添加临时课程、导入课表；含 Tooltip / 可访问名称。
- 设置管理应用；课表配置通过“课表管理”进入已有编辑与时间设置。设置可以有快捷入口，但不能另存一套配置。
- 平铺独有顶部浮窗：向下滚动隐藏、向上显示，使用 Dock 玻璃材质；列表不显示该浮窗。说明和编辑完成操作放在浮窗内，不能被它遮住。
- 周导航当前自然周显示“本周”，其他周显示“回到今天”。左侧时间轴完整显示开始与结束时间。
- 当前时间线为半透明苍绿色，默认开启，外观设置一项开关；今日列表及本周平铺显示，超出课程时间范围隐藏，不自动抢滚动位置。

## 已落地的主要变更

- 同周切换日期只改变高亮；周课程按周起始日期计算，保留七列。
- 布局编辑显式管理：空白、其他课程、返回键、页面 / 模式 / 弹窗切换、完成按钮可退出。8px 拖动阈值；长按后不抬手可继续拖动；浏览态不可误拖。课程文字禁止选中。
- 列表日期切换关闭浏览器滚动锚定，不触发跳到下方页面；首次定位才使用当前时间，主动浏览后尊重位置。
- 一级页面统一预留 Dock 与系统安全区，二级导入页面隐藏主 Dock。
- 文件优先导入：选择文件 → 自动识别 JSON / CSV / XLS / XLSX → 校验 → 预览 → 确认。失败给具体字段 / 行号；正常单表自动预览，异常或多工作表才展示进一步选项。
- JSON 恢复课程与完整学期元数据；CSV / Excel 未提供的配置沿用当前并在预览说明。读取 JSON / CSV 的上课、下课和午休时间；时间专用行、组合时间及别名由共同解析器处理，模板与说明使用真实字段。
- 完整连续节次时间表可改变每日节数；不完整信息不凭空推算中间节次。午休统一存在节次 breakAfter，冲突数据校验失败不覆盖。
- 网格按真实节次和休息区间计算跨度；时间、课程、空格保留圆角，时间轴最小高度 84px，Dock 选中项使用较收敛的圆角矩形。
- 设置恢复品牌卡片及“课表与日常 / 偏好设置 / 应用与数据”分组；移除重复版本信息。
- 当前时间线投影到实际行与课间边界，ResizeObserver 适配缩放。复用主页 30 秒时钟及前台刷新，不写数据库、不重读课表、不触发 native sync。

## 数据与代码入口

| 职责 | 文件 |
| --- | --- |
| 统一 Schedule / Period / 偏好模型 | web/src/lib/model.ts |
| 时间验证、午休、当前时间语义位置 | web/src/lib/scheduleTime.ts |
| JSON 归一化、文件解析与时间应用 | web/src/lib/import.ts、fileImport.ts、importTime.ts |
| 旧数据迁移与持久化 | web/src/lib/migration.ts、storage.ts、web/src/state/AppState.tsx |
| 列表 / 平铺共享视觉焦点 | web/src/lib/homeFocus.ts、web/src/state/useHomeFocus.ts |
| 主页、时钟、浮窗 | web/src/screens/Home.tsx |
| 网格、拖动与 Resize | web/src/components/TimetableGrid.tsx、web/src/lib/gridLayout.ts |
| 时间线 DOM 几何投影 | web/src/components/CurrentTimeLine.tsx |
| 课表管理 / 配置 | web/src/screens/ScheduleManagement.tsx、ScheduleSettings.tsx |
| 统一导入流程 | web/src/screens/Import.tsx、web/src/components/FileImport.tsx、ImportSteps.tsx |
| 设置与外观开关 | web/src/screens/Settings.tsx |
| 导航、安全区、Dock | web/src/App.tsx、web/src/nav/useNavigation.ts、web/src/components/GlassDock.tsx |
| 样式 | web/src/theme/app.css、liquid.css、timetable.css |

单一来源：`Schedule.periods` 决定每日节数、上课 / 下课 / 午休；学期日期、周数和课程属于当前 Schedule。不要给 Home、Settings、Import、CourseEditor 各建一份同类状态。旧偏好缺少时间线字段默认开启；已有关闭值保留。

## 环境与复现

React 19 / TypeScript / Vite；Kotlin Android WebView。云环境已使用 Node 24、npm 11、JDK 17、Gradle 8.13、Android SDK 36。SDK 最低 26。保留锁文件，优先在已有 checkout 工作，不另建 worktree。

```bash
npm ci
npm run check
npm run build
npm run dev
```

浏览器测试在另一终端运行；云环境使用 Chromium：

```bash
CHROME_PATH=/usr/bin/chromium node scripts/check-current-time-line.mjs
CHROME_PATH=/usr/bin/chromium node scripts/check-toolbar-import.mjs
CHROME_PATH=/usr/bin/chromium node scripts/check-primary-navigation.mjs
CHROME_PATH=/usr/bin/chromium node scripts/check-home-interaction.mjs
CHROME_PATH=/usr/bin/chromium node scripts/check-file-times-ui.mjs
CHROME_PATH=/usr/bin/chromium node scripts/check-ui.mjs
```

Windows 请使用自动发现的 Chrome / Edge，或 PowerShell 设置 `$env:CHROME_PATH`，不要直接执行上面 Linux 环境变量语法。`node scripts/ci.mjs` 会启动自己的 Vite；运行前停止已占用 5173 的开发服务器。

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --console=plain --no-daemon --max-workers=2
```

Windows 使用 `./gradlew.bat`。先配置 JDK 17、SDK 36、JAVA_HOME / ANDROID_HOME，必要时本机生成 local.properties，不提交。不要关闭 TLS / 包校验来绕过代理问题。此机器 `/workspace/tooling/run-dolphin-android.py` 是本地环境辅助脚本，不是源码包的必需依赖。

## 验证证据与限制

交付目录“验证记录.zip”包含实际测试 JSON / CSV、截图、报告与日志；总索引为 `evidence/upgrade-verification.json`。已经完成：60 项数据测试、23 项工程检查；真实 JSON / CSV 时间文件 21 项、主页交互 23 项、一级导航 22 项、通用 UI 26 项、浮窗与导入 18 项、当前时间线 11 项。汇总明确列出沿用前轮的检查，不能当成本轮全部重跑。截图与夹具不是用户私人课表。

Android debug 构建通过；2 项单测报告无失败（本轮 Gradle UP-TO-DATE）；lint 0 错误、28 警告。APK 内 8 个网页资源与当前 web/dist 一致。

尚未验证：手机 / 模拟器的触摸与返回键、系统栏与字体缩放、安装、通知后台调度、更新下载、真实文件选择器及 ROM 行为。云 Chromium 禁止 file://，离线页面双击未实测；公开 Release HTTPS 浏览器检查受证书信任限制，受控响应 UI 和 curl 系统 CA 请求分别验证，未绕过 TLS。不得宣称“全部实机验收通过”。

## 交付与下一步

1. 先在真实 Android 测试 JSON / CSV 夹具，确认时间 / 午休 / 节数同步与重启持久化。
2. 实测长按不抬手拖动、上下 Resize、空白退出、普通及预测返回、切换视图焦点、Dock 遮挡与时间线。
3. 若修改应用代码，重新 build 并同步 APK 网页资源；不能只替换 web ZIP 忘记 Android 包。
4. 源码准入使用 source-policy.json；源码不含缓存、IDE、本机配置、密钥、原始提示词、APK 或 ZIP。Gradle wrapper JAR 为明确允许的构建依赖。
5. 本次 APK 是 `com.dolphin.calendar.debug` 的调试安装包，不能作为正式发行包或声称覆盖安装正式 App。原发行密钥不在交付中。现有 `npm run deliver` 是 Windows 正式签名交付脚本，不是这次 debug 打包命令。
6. 当前线上 v1.4.3 属于此前发布，与本次同版本开发快照不同。继续开发无需发布；提交、正式版本号、签名与上传 Release 由维护者明确安排。
