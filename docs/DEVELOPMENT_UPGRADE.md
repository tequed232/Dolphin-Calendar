# 课表、导入与显示升级

在原 React / TypeScript / Kotlin 项目内实现，共用已有组件、导航、课表模型和 IndexedDB。没有建立独立应用。

## 数据与同步

`Schedule.periods.length` 是唯一课程节数来源，支持 1–24 节，含 8 / 10 / 12 / 14 节。显式起止时间仍以 `periods` 为准，不重复存储课时、课间和第一节时间，以避免配置漂移。

导入支持 `term` / `semester` 和 `schedule` / `data` / `result` 包裹。除原 `times` / `periodTimes` / `periods` 时间数组外，支持 `courseCount` / `sectionCount` / `periodCount`，以及 `firstStart` / `duration` / `breakMinutes` 生成时间。`times.index` 可排序，须从 1 连续且不重复。显式数量和时间数组长度不一致、时间倒序或重叠会报错。

```json
{
  "semester": { "startDate": "2026-09-07", "weeks": 20 },
  "schedule": {
    "courseCount": 12,
    "firstStart": "08:20",
    "duration": 45,
    "breakMinutes": 10,
    "courses": [{ "name": "数学", "day": 1, "start": 1, "end": 2, "weeks": [1, 2, 3] }]
  }
}
```

未提供的开学日期、周数和时间保留当前配置；只指定第一节时间时整体平移，保留各节原有时长和课间，只指定时长或课间时保留其余参数。显式课程周次超过学期则扩展学期。省略课程数组且包含有效学期或时间配置时，仅更新配置并保留已有课程及 ID；空课表也能单独设置配置。不会再根据名称猜测九月一日或默认 52 周。

所有编辑均通过现有 `AppState.update` 队列：先完成 IndexedDB 事务，再更新 React 状态和原生镜像。课表管理、主页、搜索、课程编辑和提醒共用同一份 Schedule。配置页只保留未保存的草稿，提交后所有页面接收同一配置。

增加节次保留既有时间，追加新时段；同时导入新时间参数时先应用新时间，再增加节次，旧末节接近午夜也不会阻断合法的新配置；晚间剩余时间不足以容纳同等时长时缩短新增时段，需要时可通过“自动顺延”统一生成。自动生成不允许跨午夜。减少有课节次须确认；课程数据保留，超出范围的课程暂不显示或提醒，增加节次或编辑课程后恢复。

## 兼容与迁移

数据库版本与 `schema: 1` 保持不变，只添加可选字段：

- `Course.temporary?: boolean`
- `Course.specificDate?: string`，本地 `YYYY-MM-DD` 日期
- `Settings.timetableMode?: 'list' | 'grid'`
- `Settings.showTimes?: boolean`

加载旧数据时优先读取 `timetableMode`，兼容旧 `viewMode`；缺省才使用列表模式和显示时间。保留课表、课程 ID、教材、背景和原有偏好。完整备份可恢复空课表、节数缩短后隐藏的课程及课程 ID；旧午间无时间分组在预览、确认、导出再恢复间保持一致，并明确提示补齐时间。普通空课程输入仍拒绝。兼容旧 `section`、`startSection`、`endSection`、`dayOfWeek` 字段到现有 `start` / `end` / `day`。原二维 `periods[].days`、中午分组、中文与英文星期、周次范围和单双周继续支持。

## 导入格式

主页、课表管理和数据页统一进入原有导入页：选择文件 → 自动识别格式 → 解析与校验 → 预览变更 → 确认导入 → IndexedDB 保存 → 广播刷新。步骤组件标记当前、完成和未开始阶段。默认不要求选择格式；扩展名未知且内容无法识别、或扩展名与内容不符时才出现人工确认。JSON 粘贴和格式说明折叠为可选入口。预览展示数量、开学日期、周数、每日节数、每节时间、跳过项目和课程冲突；覆盖课程前明确说明。Parser 不操作 UI state。

| 格式 | 支持 |
|---|---|
| JSON | 原有扁平课程、顶层数组、课程别名、包裹对象、旧二维分组；配置与课程统一导入；文本入口保留围栏兼容 |
| CSV | UTF-8 / UTF-16 BOM / GB18030；逗号、制表符或分号；引号、重复引号和引号内换行；扁平课程表或星期×节次表 |
| XLSX / XLS | SheetJS CE（锁定 `@e965/xlsx 0.20.3`）；多工作表选择；扁平课程表或星期×节次表；纵向合并识别为连堂；行列区域映射 |

扁平表头支持：课程名 / 课程名称 / name、星期 / day / dayOfWeek、节次 / sections、开始节次 / start / startSection、结束节次 / end / endSection、周次 / weeks、教师 / teacher、教室 / room / classroom、备注 / notes。节次支持数字、`第1节`、`第一节`、`1-2`、`第1-2节`。星期支持周一、星期一、一、Monday、Mon 等直到周日。

二维单元格第一行作课程名；后续 `教师：`、`老师：`、`教室：`、`周次：` 可识别，其余原文保留备注。未知学校模板可手动指定星期行、节次列和课程区域。跨星期合并不会擅自分配课程，会列为错误项目。

每个文件最多 5 MB、表格最多 3000 行 / 100 列、100 个工作表；沿用 2000 条课程和 20000 次上课上限。JSON 的严格解析 API 保留；导入预览会明确列出坏课程及跳过数量，包裹对象与扁平格式使用相同规则。表格先校验每行的节次，再扩展时间轴，坏行不会阻断有效课程。显式空课程数组、全无效数据和全局配置错误仍拒绝；有效的仅配置导入保留已有课程。损坏 Excel、未知文件类型和读取失败显示错误，原数据保留。

预览明确列出“将修改”和“将保留”的内容：课程数量、名称、开学日期、学期周数、节数和上/下课时间。JSON 恢复所提供的元数据，CSV / Excel 缺省配置沿用当前设置；超过范围时扩展并展示。包含课程数组的导入会完整替换当前课程（含临时课程），预览说明替换范围；仅配置导入原样保留课程。教材继续保留。正常单工作表 JSON/CSV/Excel 直接进入预览；多工作表、映射和异常行先展示读取检查。返回修改保留文件、工作表及解析结果，不重新读取；可直接重新选择文件。预览底部确认/返回操作固定可见，长内容仍能完整滚动读取。文件读取可取消；关闭后的旧读取不会打开预览，同一文件可以重新选择。课表 JSON 导出和再导入可恢复课表配置与临时课程，不包含全部偏好、背景或教材封面。

## 临时课程和平铺视图

临时课程复用 Course、CourseEditor 和 IndexedDB，与正式课程保存到同一 `schedule.courses` 数组。默认选中当天/所点网格的日期、星期和一个节次，只填名称即可保存。清空日期后可使用周次范围及单双周重复。特定日期课程不依赖开学周次；网页日期查询、原生提醒和系统日历均按该日期处理。

顶部操作顺序：有更新时显示更新 → 添加临时课程 → 导入课表。无更新时只显示后两个，无空位；图标有名称与 Tooltip。导入先进入独立任务页，说明支持文件并提供选择入口。临时课程直接展示教室与持续节数，教师、备注可展开填写。

原日程列表保留；平铺模式固定显示本周七天与动态节次；“日期条显示周末”只作用于列表日期条。选择同周日期只改变高亮，周课程集合按周一和 Schedule 计算并缓存。普通点击打开同一课程详情，再进入原编辑器；默认不显示把手、不允许拖动。长按 500ms、键盘 F2 或“调整布局”操作选择单一课程；仅该课程显示上下把手并允许主体拖动。8px 阈值区分点击与拖动。编辑状态由 `selectedCourseId` 决定，和视觉焦点分离。

点击空白、切换课程/页面/模式、打开弹窗，以及 Android 返回都会取消布局编辑；返回优先消费编辑状态，预测返回取消不退出编辑。合法的已完成调整进入原保存队列；未完成的手势取消草稿，不提交非法位置。上下把手至少保留一节，范围为 1～当前最大节数；主体按实际行列高度吸附，指定日期课程跨天时同步日期。冲突复用原规则并确认，可取消或同时保留。重叠课程按组分列，保留所有可点击课程。行高来自每节实际时长及课间；长课间压缩显示但保持不同高度。卡片严格跨越节次边界，末尾课间留空；拖动/Resize 依据实际边界吸附，不用固定像素倍数。卡片按高度先显示名称、地点，再显示教师/节次，完整信息保留在详情。

列表和平铺提升为独立一级导航，Dock 固定顺序为列表 / 平铺 / 搜索 / 设置；顶部模式选择控件已删除。两种课表复用 Home 组件与课表模型，共用日期选择、课表管理入口及唯一焦点状态；列表保留普通页头，只有平铺使用顶部玻璃浮动框。`ViewFocus` 记录课程 ID、日期和节次，按选中课程、主要可视课程、日期/节次恢复，分别计算各自布局位置，不复用像素偏移。目标映射在布局阶段完成，位于固定栏与底部导航之间的中上阅读区域；切换不重新读取/解析课表，也不重发原生初始化、镜像同步或重排提醒。

首次进入在数据就绪后根据当天当前/下一课程定位一次；用户滚动或选中后由其浏览位置决定焦点，不受实时钟刷新影响。退出布局编辑仍保留刚才的课程焦点。横向网格将对应星期移至可见区域；节次/时间列固定在左侧，完整保留时间语义。重复点当前导航不改日期、滚动或编辑状态。一级导航不加入返回历史；导入和配置任务隐藏 Dock，并返回原路由原位置。统一容器按是否存在 Dock 预留导航高度、系统安全区和额外间距。

## 功能归属与 CSV 说明

设置保留外观、实时通知、导航与学校、应用更新、数据与备份、关于等应用级功能。主页“课表管理”集中课程列表、开学日期/学期周数/课程节数、上课时间、导入与系统日历；导出和恢复实现集中在“数据与备份”，课表管理提供该页面的快捷入口；复用原 `editor` 路由，不复制课表配置表单；设置根页提供“课表设置”快捷入口，打开同一个配置路由。课表设置继续使用已有应用内月历和离开草稿保护。课表 JSON 导出并非完整应用备份，数据页明确说明范围。

CSV 说明和表头识别共享 `CSV_FIELDS` 字段定义，“CSV 示例模板”导出真实 Parser 支持的文件。名称、星期和节次必需；节次可用单列范围，或开始/结束两列。周次可省略以沿用学期，支持 `1-16` / `1-16单` / `1-16双`；教师、教室、备注可选。CSV 保留当前开学日期，支持 `上课时间` / `下课时间`（`startTime` / `endTime`）及 H:mm / HH:mm。课程行只更新开始节次的上课时间、结束节次的下课时间；连堂中间节次保留原值。独立 `节次,上课时间,下课时间` 时间表保留课程，完整连续 1–N 行将每日节数设为 N，部分行保留其他时段；时间冲突、缺半对、重叠或倒序具体报错并阻止导入。格式说明与“CSV 时间模板”直接取自 Parser 的 `CSV_TIME_NOTES` / `CSV_TIME_TEMPLATE`。需要同时恢复学期日期配置请用 JSON。

```csv
课程名,星期,开始节次,结束节次,上课时间,下课时间,周次,教室,教师,备注
高等数学,周三,5,6,,,1-16,16栋203号教室,陈老师,示例课程
大学英语,Friday,3,4,,,1-16单,3栋402号教室,林老师,单周上课
```

## Release 更新

Android 继续使用原有 `AppUpdates.kt` / GitHub `releases/latest`、正式语义版本比较、每日调度与手动检查，新增 Release 标题、发布时间字段。下载仍由用户选择并交由 Android 下载管理器完成。

网页增加同一官方 API 的每日/手动检查，仅接受正式 `vX.Y.Z` 或 `X.Y.Z` 且版本更高的 Release；排除 draft / prerelease 和不匹配仓库的地址。缓存保存到 IndexedDB 单独 `release` 键，不覆盖课表。网络失败显示提示，保留此前已验证的更新，应用其他功能继续可用。网页前往 Release，应用内 APK 下载仅限 Android。

## 文件改动

| 文件 | 主要改动 |
|---|---|
| `web/src/lib/model.ts` | 可选临时课程与显示字段；指定日期查询；超出节次课程过滤 |
| `web/src/lib/scheduleTime.ts` | 节次生成/增减、时间日期验证、日期与周次冲突判断 |
| `web/src/lib/import.ts` | 缺失配置保留、动态节数/时间参数、别名、日期课程兼容 |
| `web/src/lib/fileImport.ts` | CSV / Excel 读取、自动/手动映射、合并识别、错误预览 |
| `web/src/lib/migration.ts` | 旧课程字段和显示偏好迁移 |
| `web/src/lib/storage.ts` | 加载时迁移；独立 Release 缓存 |
| `web/src/lib/releases.ts` | 正式版本与 API 元数据校验 |
| `web/src/state/AppState.tsx` | 单一保存队列、更新检查；显示模式变化跳过原生课表镜像重发 |
| `web/src/state/useAppUpdates.ts` | 网页每日/手动检查、缓存、失败隔离；保留原生桥 |
| `web/src/components/FileImport.tsx` | 工作表选择、映射、错误项目与识别汇总 |
| `web/src/components/ScheduleSettings.tsx` | 同步配置编辑、节数确认、时间列表与自动顺延 |
| `web/src/components/TimetableGrid.tsx` | 周网格、空格创建、课程编辑、吸附拖动与冲突确认 |
| `web/src/components/CourseEditor.tsx` | 临时课程预填、可选信息折叠、日期编辑、冲突确认 |
| `web/src/components/CourseSheet.tsx` | 指定日期课程详情展示实际日期 |
| `web/src/screens/Home.tsx` | 两一级视图复用、顶部三操作、紧凑周标题 |
| `web/src/screens/Import.tsx` | 统一多格式入口、预览汇总与配置保存 |
| `web/src/screens/Settings.tsx` | 应用级设置、备份范围说明，恢复简介和三个分类，课表管理复用已有配置页面 |
| `web/src/screens/ScheduleManagement.tsx` | 抽取原课表编辑页面，集中课程/配置/时间/导入导出 |
| `web/src/components/SettingsControls.tsx` | 复用设置行组件 |
| `web/src/lib/export.ts` | 网页和原生共享导出，支持 CSV 模板 MIME |
| `web/src/lib/homeFocus.ts` / `web/src/state/useHomeFocus.ts` | 共享语义焦点、首次定位、滚动采集、模式映射 |
| `web/src/screens/Updates.tsx` | 网页手动检查、Release 标题和发布时间 |
| `web/src/App.tsx` | 统一导入/管理路由、返回编辑状态优先、稳定原生回调 |
| `web/src/nav/useNavigation.ts` | 四个一级路由、任务完成返回、根导航不入历史 |
| `web/src/components/GlassDock.tsx` | 按实际项目数量计算布局与透镜，四项等宽且保持已有材质 |
| `web/src/components/ImportSteps.tsx` | 五阶段状态及无障碍语义 |
| `web/src/lib/gridLayout.ts` | 整周课程、非等距行高与语义吸附 |
| `web/src/theme/timetable.css` | 周网格、卡片、拖动、紧凑设置、响应式与深色样式 |
| `app/src/main/java/com/dolphin/calendar/ReminderScheduler.kt` | 指定日期课程生成原生提醒 |
| `app/src/main/java/com/dolphin/calendar/CalendarSync.kt` | 指定日期课程的预计日历数量 |
| `app/src/main/java/com/dolphin/calendar/AppUpdates.kt` | Release 标题与发布时间 |
| `package.json` / `package-lock.json` | 锁定 Excel 库，注册新增数据测试 |
| `scripts/check-schedule.test.ts` | 时间同步、XLS/XLSX/CSV、异常、迁移、冲突与 Release 测试 |
| `scripts/check-schedule-ui.mjs` | 用户验收场景与屏幕适配回归 |
| `scripts/check-file-times-ui.mjs` | 真实磁盘 JSON/CSV 文件全流程、自定义时间与节数同步、取消和错误保护 |
| `scripts/check-primary-navigation.mjs` | 四路由、日期切换、底部安全区、任务导航、自动识别、配置同步和旧偏好验收 |
| `scripts/check-home-interaction.mjs` | 分类/统一导入/焦点/编辑退出/真实触摸/稳定切换验收 |
| `scripts/check-import.test.ts` | 日期缺省改为保留配置的断言 |
| `scripts/check-ui.mjs` | 新设置布局、多格式入口和日期保留的回归 |
| `scripts/check-import-ui.mjs` | 新预览汇总、保留日期、未知文件拒绝、读取取消、仅配置保存回归 |
| `scripts/check-home-search-experience.mjs` | 列表显示时间开关、刷新持久化及临时课程日期详情回归 |
| `scripts/check-course-experience.mjs` | 新增冲突确认后继续检查重复提交与事务保护 |
| `scripts/check-source.mjs` | 周数缺省与普通空导入规则对应的新守卫 |
| `scripts/verify.mjs` / `scripts/ci.mjs` | 注册新增数据/浏览器检查 |
| `README.md` / `THIRD_PARTY_NOTICES.md` | 格式、行为、验证入口和 Excel 库许可证说明 |

## 平铺浮动框与设置入口（10 月 8 日）

浮动框只在平铺使用 sticky；列表页头随内容滚动，不再套用浮动背景。平铺向下滚动累计超过 24px 收起、向上超过 12px 显示，顶部始终显示；查看详情或编辑时保留原显隐状态，避免突然遮挡课程；切换布局时先定位焦点再显示操作入口。浮动框使用 Dock 的透明色、边框、轻模糊与饱和度，并跟随关闭玻璃、性能降级和减少动画偏好。显隐只改变 transform/opacity，保留布局高度；隐藏期间 inert，不能挡住点击或获得键盘焦点。共享焦点计算排除隐藏浮动层，程序定位不会误触发收起。

设置页恢复原有简介卡片，并划分为“课表与日常”“偏好设置”“应用与数据”三组。主页显示与课表管理分别打开已有页面；课表管理集中课程、学期和上课时间，仍使用同一 ScheduleSettings 和保存逻辑。外观中移除重复的主页显示入口。课程 CSV 示例的时间列留空，以避免与已有自定义课时冲突；完整时间替换继续使用独立时间模板。

新增 `scripts/check-toolbar-import.mjs` 的 18 项验收覆盖玻璃材质/滚动显隐/焦点连续/设置共享配置、自动预览/返回修改无重复读取、异常重选、多工作表保留，以及小屏/横屏/缩放下的固定确认按钮和底部安全区。截图为 `grid-toolbar-glass-dark.png`、`settings-grouped.png`、`import-preview-actions.png`，结果为 `toolbar-import-results.json`。

## 验证和限制

网页构建包含 TypeScript 类型检查；仓库没有独立网页 lint 命令，`npm run check` 运行源码准入/工程守卫/资源检查与 Node 测试。浏览器检查需要开发服务器和 `CHROME_PATH`（此云环境为 `/usr/bin/chromium`）。结果写入忽略路径 `build/evidence/`。

已通过网页构建/类型检查、源码准入、23 条工程守卫、60 项数据测试、26 项原有浏览器守卫、10 项课表验收、6 项导入全链路、21 项真实 JSON/CSV 文件时间界面验收、12 项主页/搜索体验检查、22 项四导航/导入/安全区验收、23 项主页交互验收（含 CDP 真实触摸事件）、14 项月历回归、7 项草稿/返回流程，以及原有课程/教材编辑与原生更新桥回归。Android `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug` 已通过，2 项原生版本单元测试通过；lint 为 0 错误、28 个警告。调试 APK 位于 `app/build/outputs/apk/debug/app-debug.apk`，已逐一比对 APK 内 8 个网页资源文件与最终构建一致。最终验证汇总（含 APK SHA-256）位于 `build/evidence/upgrade-verification.json`，界面截图为 `build/evidence/schedule-grid-light.png`、`schedule-grid-dark.png` 和 `file-times-grid.png`。实际文件样本为 `custom-timing.json`、`custom-timing.csv`、`custom-period-times.csv`，21 项界面结果为 `file-times-results.json`。未执行实机/模拟器测试。新增 Excel 解析库增加网页包体积；学校非标准布局仍可能需要映射，截图/OCR 和自动解析每一种教务文件不在支持范围。特定日期/删除/拖动只改变本机数据，不跨端同步。原有通知和 ROM 限制仍适用。此云环境 Chromium 策略不允许 `file://`，双击离线检查不能在这里完成。

云环境真实 Release API 已用系统 CA 验证的 curl 请求获得 HTTP 200，官方最新正式版为 `v1.4.3`，与当前应用相同，正确判定为无新版本。证据为 `build/evidence/release-live-results.json`。云环境 Chromium 对该 HTTPS 请求报 `ERR_CERT_AUTHORITY_INVALID`，没有绕过 TLS 校验；页面的更新提示/版本判断/失败隔离仍用可控响应验证。`api.github.com` 保留在配置草稿允许列表；草稿保存不代表应用或发布配置。


## 自动导入作息与午休

JSON 的 `times` / `periodTimes` / `lessonTimes` / `作息时间` 数组支持独立起止字段、`time` / `timeRange` 时间段、直接时间字符串；`lunchBreak` / `午休` 支持起止对象或时间段，或在数组中写 `label: "午休"` 的休息项。CSV / Excel 支持原来的上课/下课列，也支持 `时间` / `时间段` / `timeRange` 列；节次列中 `午休` / `Lunch Break` 为休息行，矩阵中不生成课程。时间段支持短横线、长横线、波浪线、至/到，时间支持 H:mm / HH:mm 及秒为 00 的 HH:mm:ss。午休不占课程节次，完整课时覆盖 1–N 节时只按实际授课项设置节数。

两种格式共用 `importedTime` 和 `applyPeriodTimes`，不会平均推算连堂内部课间。明确写出的午休保存到前一课时的可选 `breakAfter`，所有数据仍在 `Schedule.periods` 中，备份可恢复；缺省时根据两节课之间的长间隔识别午休/晚休。休息时间必须在前后课时之间，不会为了满足午休而猜测或覆盖文件里未提供的课程时间。导入预览、平铺课表和时间设置使用同一 `periodRest`，并保留原圆角和主题。重叠、缺半对、同一休息区间冲突或两种时间写法不一致会报错。手动调整课时或缩短节数时，仅清理无法继续匹配的休息注释。

实际文件验收另包含 `custom-lunch-times.json`、`custom-lunch-times.csv` 和 `invalid-lunch-overlap.csv`：读取、预览、确认、设置与网格显示、课时数、原课程 ID、原生 sync、重新打开后的持久化、异常原数据保护。截图为 `imported-lunch-settings.png`，完整结果在 `file-times-results.json`。

列表选择日期时原地更新内容，移除自动课程居中请求并禁用列表滚动锚定；列表及平铺课程禁止文本选中和长按文本菜单。主页交互验收新增日期条/月历的逐帧稳定性和列表课程长按测试，原真实触摸拖动/Resize 与视图切换仍保留。

真实触摸长按后不松手拖动验收通过：仅在当前选中课程的活动编辑手势中阻止原生 touchmove 滚动，避免 pointercancel 中止拖动；浏览滑动仍交由页面滚动，Resize 与退出行为共用原状态。

平铺操作说明和完成按钮通过 Portal 放入现有顶部浮窗，随同收起/显示；列表不显示布局说明。固定说明区域高度，进入/退出编辑不移动网格。节次时间格使用 12px 圆角，将课时和休息标签分开绘制，保留原非等距时长、午休和跨节尺寸。验收新增说明实际边界、编辑前后几何一致及时间格圆角检查。

时间轴最小课时高度调整为 84px，并固定节次和上下课时间行距、上下内边距，确保两行时间完整落在圆角格内；课间和午休仍独立占位。Dock 选中轮廓静止使用 16px 圆角、按压最高 20px，mask、透镜贴图、裁切和描边复用同一个几何函数，保留原有玻璃与弹性滑动。周导航按选中日期是否属于当前自然周显示“本周”或“回到今天”，中间按钮预留相同宽度，左右箭头不位移。18 项浮窗/导入验收包含时间文字实际边界、列表和平铺的前后周/今天导航及选中轮廓一致性；玻璃像素测试仍验证实际背景折射。

当前时间线默认开启，设置 → 外观 → 显示与布局中可关闭；旧偏好缺少该字段时使用默认值，已关闭的值仍保留。今天的列表和包含今天的本周平铺课表显示半透明苍绿线；首节前和末节后隐藏，其他日期的列表/其他周的平铺不显示。`currentTimePosition` 从唯一 `Schedule.periods` 计算课时/课间/午休进度，跳过旧无时间分组；`CurrentTimeLine` 根据当前布局的实际边界投影，尺寸变化时重新测量。复用 Home 的 30 秒时钟，回到前台立即刷新；不自动滚动、不读写课表、不重发原生同步。线条不参与布局或命中，保留课程点击、长按和 Resize。

新增 3 项时间映射/旧偏好数据测试和 `scripts/check-current-time-line.mjs` 的 11 项浏览器验收：两个布局、自定义短/长课时、课间及午休、日期/周切换、深浅色/窄屏/110%缩放、开关与重启、边界、手势、定时不跳动、真实 JSON/CSV 导入和午夜。结果为 `current-time-line-results.json`；截图为 `current-time-grid-dark.png`、`current-time-list-light.png` 和 `current-time-setting.png`。
