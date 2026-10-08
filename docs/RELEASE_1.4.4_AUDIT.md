# 1.4.4 交付包对比与发行记录

比较日期：2026-10-08（Asia/Singapore）。远端基准为 [7f2a657](https://github.com/tequed232/Dolphin-Calendar/commit/7f2a65766ee59f3c1c9e71c2d5b53a38f20a7fb4)；输入是作者提供的 `Dolphin-Calendar-1.4.3-交付包.zip` 中的源码快照。交付包沿用 1.4.3 版本号，但包含线上 1.4.3 尚未发布的功能。

输入交付包源码与远端基准规范化文本换行后，137 个文件相同，55 个文件不同，30 个文件新增，没有缺失文件。完整列表见下文。这是输入比较，尚未计入本轮 1.4.4 的发行元数据、文档、验证脚本与工作流更新；`LICENSE` 虽在输入中不同，最终仓库保留远端原文。

本次原样同步交付包实现，不重写或重构功能。`node scripts/check-delivery-integrity.mjs` 对 123 个 `web/src` / `app/src` 文件执行 SHA-256 核对（文本换行规范化），将 `web/src/meta.ts` 的发行版本归一化到交付包 1.4.3 后比较；本次实际发行版本为 1.4.4。保留远端原始 GPL-3.0 `LICENSE`。额外修改只涉及版本元数据、README、发行/验证/配置文档、验证脚本及发布工作流。

## 功能差异

| 范围 | 线上 1.4.3 | 本次同步的交付包实现 |
| --- | --- | --- |
| 一级导航 | 主页 / 搜索 / 设置 | 列表 / 平铺 / 搜索 / 设置；共享日期、课程与节次焦点 |
| 导入 | JSON | JSON / CSV / XLS / XLSX；识别、校验、预览、确认；工作表与时间模板 |
| 课表配置 | 旧设置编辑入口 | 课表管理；统一学期、节数、起止时间与午休；缺省配置沿用当前值 |
| 课程布局 | 日程列表 | 七天网格、临时课程、长按移动、上下调整起止节次与冲突确认 |
| 当前时间 | 课程状态提示 | 可关闭的当前时间线；实际节次/课间投影 |
| 更新检查 | Android 每日/手动检查 | Android 延续；网页增加手动及打开期间的每日正式 Release 检查，结果独立缓存 |
| 原生数据 | 周期课表 | 原生提醒及系统日历兼容指定日期临时课程 |

## 发行配置

- 正式版：1.4.4，versionCode 10404，包名 `com.dolphin.calendar`。
- 原发行证书 SHA-256 指纹为 `9cb966441a36917de63b61d6bdb8d5152de7bac92f198c8031b3d307f76dd419`。`check-release.ps1` 已与线上 1.4.3 正式 APK 对照：包名及指纹一致，版本码从 10403 递增至 10404；原签名密钥和本机配置不公开。
- 原交付包的 `com.dolphin.calendar.debug` APK 仅作参考；Release 由当前源码重新编译。
- Pages 从同一源码构建 `build/pages`，验证 `/Dolphin-Calendar/` 子路径、持久化、离线缓存与升级。
- 旧 v1.4.3 标签及附件保留；新版本使用 v1.4.4。

## 本轮验证与发布配置调整

- `npm run check` 在既有源码准入、工程、资产与 TypeScript 测试前增加交付包源码一致性检查；Pages 工作流也在构建前执行该检查。
- `check-pages.mjs` 与 `check-offline.mjs` 沿用既有验证目标，适配四项一级导航与当前统一导入返回路径。网页默认自动检查正式 Release，因此仅允许本仓库 `releases/latest` 端点；Pages 检查使用受控 API 响应，出现其他外部资源请求会使检查失败。
- `static.yml` 从同一源码构建并验证 `build/pages`，上传完整 Pages 部署目录；普通验证工作流继续执行网页及 Android debug 检查，不接触发行私钥。
- README 按实际源码更新设置入口、网页检查生命周期、导入与课表配置说明。旧主页演示图明确标为历史外观参考；交付包的历史验证文档不作为本轮验收结论。
- 正式源码 ZIP 从待发布 Git 提交归档，保留 `LICENSE`、准入配置与钩子；验证 ZIP 以本轮证据为准，不由旧交付脚本的手工文件白名单决定。

## 不同文件

- `app/src/main/java/com/dolphin/calendar/AppUpdates.kt`
- `app/src/main/java/com/dolphin/calendar/CalendarSync.kt`
- `app/src/main/java/com/dolphin/calendar/MainActivity.kt`
- `app/src/main/java/com/dolphin/calendar/ReminderScheduler.kt`
- `LICENSE`
- `package-lock.json`
- `package.json`
- `README.md`
- `scripts/check-background.mjs`
- `scripts/check-calendar-device.mjs`
- `scripts/check-calendar-picker.mjs`
- `scripts/check-course-experience.mjs`
- `scripts/check-date-device.mjs`
- `scripts/check-device.mjs`
- `scripts/check-dock-device.mjs`
- `scripts/check-experience.mjs`
- `scripts/check-glass.mjs`
- `scripts/check-holidays.mjs`
- `scripts/check-home-search-experience.mjs`
- `scripts/check-import-ui.mjs`
- `scripts/check-import.test.ts`
- `scripts/check-keyboard-device.mjs`
- `scripts/check-layout.mjs`
- `scripts/check-liquid-modes.mjs`
- `scripts/check-master-glass.mjs`
- `scripts/check-notifications-device.mjs`
- `scripts/check-offline.mjs`
- `scripts/check-onboarding.mjs`
- `scripts/check-pages.mjs`
- `scripts/check-source.mjs`
- `scripts/check-ui.mjs`
- `scripts/check-updates.mjs`
- `scripts/check-visual-regressions.mjs`
- `scripts/ci.mjs`
- `scripts/verify.mjs`
- `THIRD_PARTY_NOTICES.md`
- `web/src/App.tsx`
- `web/src/assets/icons/LICENSE`
- `web/src/components/CalendarPicker.tsx`
- `web/src/components/CourseEditor.tsx`
- `web/src/components/CourseSheet.tsx`
- `web/src/components/GlassDock.tsx`
- `web/src/components/Icon.tsx`
- `web/src/lib/import.ts`
- `web/src/lib/model.ts`
- `web/src/lib/storage.ts`
- `web/src/nav/useNavigation.ts`
- `web/src/screens/Home.tsx`
- `web/src/screens/Import.tsx`
- `web/src/screens/Settings.tsx`
- `web/src/screens/Updates.tsx`
- `web/src/state/AppState.tsx`
- `web/src/state/useAppUpdates.ts`
- `web/src/theme/app.css`
- `web/src/theme/tokens.css`

## 新增文件

- `docs/CODEX_HANDOFF.md`
- `docs/DEVELOPMENT_UPGRADE.md`
- `docs/NAVIGATION_INTERACTION.md`
- `scripts/check-current-time-line.mjs`
- `scripts/check-file-times-ui.mjs`
- `scripts/check-home-interaction.mjs`
- `scripts/check-navigation.mjs`
- `scripts/check-primary-navigation.mjs`
- `scripts/check-schedule-ui.mjs`
- `scripts/check-schedule.test.ts`
- `scripts/check-toolbar-import.mjs`
- `web/src/assets/icons/grid.svg`
- `web/src/assets/icons/list.svg`
- `web/src/components/CurrentTimeLine.tsx`
- `web/src/components/FileImport.tsx`
- `web/src/components/ImportSteps.tsx`
- `web/src/components/ScheduleSettings.tsx`
- `web/src/components/SettingsControls.tsx`
- `web/src/components/TimetableGrid.tsx`
- `web/src/lib/export.ts`
- `web/src/lib/fileImport.ts`
- `web/src/lib/gridLayout.ts`
- `web/src/lib/homeFocus.ts`
- `web/src/lib/importTime.ts`
- `web/src/lib/migration.ts`
- `web/src/lib/releases.ts`
- `web/src/lib/scheduleTime.ts`
- `web/src/screens/ScheduleManagement.tsx`
- `web/src/state/useHomeFocus.ts`
- `web/src/theme/timetable.css`

## 验证

本轮结果在 [STATUS.md](STATUS.md) 的 1.4.4 节记录；历史结果不作为本轮重跑证据。签名、包名和递增版本码检查证明覆盖升级的身份条件，实际覆盖安装、首次安装时间或 UID 连续性、应用数据保留须以独立设备记录为准。模拟器结果不替代用户手机上的 ROM 通知调度、系统文件选择器、通知外观与性能验收；Release 及 Pages 的完成状态以 GitHub 的实际发布结果为准。

本轮已实际完成 Android 16 / API 36 独立模拟器的正式覆盖升级：旧版真实界面导入合成课程与学期、保存深色主题和 110% 缩放，旧版冷启动后执行 `adb install -r`，新版冷启动仍保留上述数据。版本从 10403 升至 10404，appId 为 10216、数据目录不变，四栏导航均可打开。详见本轮验证附件的 `1.4.4-upgrade-results.json`、`1.4.4-upgrade-visual-review.json` 与对应截图。

浏览器回归最终 20/20 组通过，原 CI 通过 16 组，其余 4 组只修正测试样本、时钟及旧界面断言后补跑通过；没有修改功能实现以迁就测试。241 条 PASS 输出对应 246 项命名或汇总验收，原失败记录及最终证据保存在 `browser-regression-results.json` 和原始/补跑日志。
