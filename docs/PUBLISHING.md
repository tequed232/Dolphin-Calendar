# 发布与配置检查

## 1.4.5 导航与覆盖升级配置（2026-10-10）

版本来源仍为 web/src/meta.ts，正式包使用 1.4.5 / 10405、原包名与原发行签名。新原生导航不引入额外权限或依赖；Web 与 APK 继续同步同一份构建。交付包一致性检查保留原 123 哈希，通过明确 UI 清单允许本轮界面变化，业务核心仍严格匹配。完整浏览器、原生导航、实际覆盖升级和发行资源核对完成后更新 [UI_1.4.5.md](UI_1.4.5.md)，再发布 Release 和 Pages；下文 1.4.4 清单属于历史记录。


## 1.4.4 配置更新（2026-10-08）

本轮按作者要求解析交付包源码、对比线上版本、原样同步现有功能实现，重编译覆盖升级正式 APK，并发布 Release 和现有公开 Pages。以 `web/src/meta.ts` 的 1.4.4 为版本来源，`package.json` / 锁文件元数据与其一致；Gradle 生成 versionCode 10404。恢复本机原签名配置后构建 `:app:assembleRelease`，使用 `check-release.ps1 -PreviousApk` 与线上 v1.4.3 正式附件对比。应用源码一致性通过 `node scripts/check-delivery-integrity.mjs` 核对 123 个应用源码及资源文件，文本换行规范化后仅允许发行版本元数据变化；`npm run check` 和 Pages 工作流均执行此检查。

新发布包包括正式 APK、网页 ZIP、待发布 Git 提交源码 ZIP、本轮验证记录 ZIP 和 SHA-256 清单。源码 ZIP 从该 Git 提交归档，包含 `LICENSE`、源码准入策略及本地钩子；密钥、IDE 文件、依赖缓存与本机配置排除。验证附件按实际运行结果收集，历史文件明确标明原版本；旧 v1.4.3 保留。配置与差异记录见 [RELEASE_1.4.4_AUDIT.md](RELEASE_1.4.4_AUDIT.md)。

作者最初创建私有源码仓库并要求源码准入规则，随后将 [tequed232/Dolphin-Calendar](https://github.com/tequed232/Dolphin-Calendar) 调整为公开状态，授权本轮 Release 与 GitHub Pages 发布。本轮沿用现有仓库与 `main` 分支，保留已有提交历史及作者选择的 GPL-3.0 `LICENSE`。以下清单作为维护与发行核对使用，不代表每项都已执行；完成状态以 [STATUS.md](STATUS.md)、本轮证据及 GitHub 实际结果为准。

## 网页入口与 GitHub Pages

首页采用联网优先、离线回退策略，避免部署更新后一直读取旧首页。旧缓存升级检查会先安装旧版缓存策略，再模拟过期首页，升级到新缓存策略后验证页面恢复、导入课程仍保留及断网可用。此前已经打开的旧页面首次更新时，可在本站链接中添加版本查询参数（如 `?v=1.4.4`）绕过旧首页缓存；无需清除站点数据。

运行 `npm ci`、`node scripts/check-delivery-integrity.mjs`、`npm run build:pages` 和 `node scripts/check-pages.mjs`。发布目录为 `build/pages/`：`index.html` 包含编译后的应用与样式，`assets/` 保存编译产物与本地图片，`sw.js` 提供离线缓存，`.nojekyll` 避免静态资源被 Jekyll 处理。Pages 能读取入口引用的资源，应发布整个目录；开发入口 `web/index.html` 需要构建后才能运行。

`.github/workflows/static.yml` 在 `main` 更新或手动运行时安装锁定依赖、检查交付包源码一致性、构建并执行 Pages 浏览器验证，再上传 `build/pages` 专用部署附件。部署仅在手动运行、公开仓库，或 `PAGES_ENABLED=true` 时执行；现有公开仓库满足自动部署条件。该附件不是 Git 源码提交，普通验证工作流仍不上传构建附件。部署目录只含网页构建，不发布整个源码目录；部署状态以 Actions 的实际结果为准。

Settings → Pages 的 Source 应设为 GitHub Actions。若日后改为私有仓库，应先确认账户计划支持该仓库使用 Pages，再按工作流条件设置 `PAGES_ENABLED=true` 或手动运行；当前公开仓库无需该变量。仓库可见性与站点访问范围应分别核对。参见 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

1.4.4 的网页自动更新检查默认开启。`check-pages.mjs` 为本仓库的 `releases/latest` API 提供受控响应，验证发布网页的启动、旧缓存升级、持久化和离线回退；`check-offline.mjs` 检查双击网页。两者只允许访问这一个官方版本检查端点，不将可选更新请求误判为课表离线功能失效，也不允许其他外部资源请求。真实 GitHub 请求和更新下载的验证结果应分别记录。

2026-10-07 的本地浏览器检查验证了项目子目录启动、图标加载、JSON 导入与刷新持久化、离线打开和缓存路径隔离。网页数据属于浏览器所在域名，不能自动读取 Android 数据，迁移站点前请导出 JSON。

## 源码准入与本次上传方式

规则入口是 [source-policy.json](../source-policy.json)，使用方式见 [源码准入说明](SOURCE_POLICY.md)。接收业务源码、构建配置、脚本、测试、项目文档、第三方许可及工程资源。Gradle Wrapper 的 JAR 是启动构建工具的唯一 JAR 例外。APK、ZIP、编译产物、依赖、缓存、IDE 配置、密钥、本机配置、用户数据库、ADB 备份和原始提示词均禁止入库。

`scripts/prepare-publish.ps1` 在本项目 `build/publish/` 下生成新快照并严格校验，不覆盖已有目录；该脚本只准备并检查文件，不创建 Git 提交或推送。需要独立发布快照时，另行获取远端 `main`，以其提交为父提交、保留远端 `LICENSE`，再快进推送；不推送本机原仓库的历史或其他工作树。本轮直接在基于远端 `main` 的独立审计 checkout 中同步交付包。`gradlew` 与 `.githooks/pre-*` 在 Git 中记为可执行文件。上传后比较远端完整树的路径、模式与 blob SHA。

`npm run deliver` 要求工作区干净且本轮源码、文档已提交，校验已构建的正式 APK 后输出 APK、网页 ZIP、源码 ZIP、验证记录 ZIP 和 SHA-256 清单。源码使用 `git archive HEAD`，完整包含该已提交版本的 `LICENSE`、`source-policy.json` 与 `.githooks`，不使用手工源码白名单。验证附件只收当前版本的精选结果和合成截图，不混入历史 Dock 证据或用户数据；不存在的可选证据不会被加入。该入口准备本地交付文件，不创建 Release 或部署 Pages，在线发布另按实际授权执行。

首次克隆后运行 `npm run hooks:install`。`pre-commit` 检查暂存区，`pre-push` 检查推送提交树，GitHub Actions 在 push / pull request 上检查完整树；源码验证工作流不上传构建附件，Pages 工作流使用专用部署附件。钩子需要安装且可能被绕过，CI 在接收提交之后报告结果；这些检查不等同于 GitHub 服务端拒绝上传。新增文件类型须先审阅并修改准入策略。

## 发布复核

- [ ] 审阅 README：项目定位、功能路径、JSON 示例、能力边界和作者链接符合实际。
- [x] 保留作者初始化仓库时选择的 GPL-3.0 `LICENSE`，项目说明与该选择保持一致。
- [ ] 品牌 PNG、默认背景插画按作者提供的项目资源使用，独立于业务代码许可证；文档说明素材不自动获得再分发或再许可。
- [x] 本轮目标为现有公开仓库 `tequed232/Dolphin-Calendar`、`main`、v1.4.4，保留 v1.4.3。
- [x] 本次源码同步、正式 APK 重编译、配置文档更新、Release 和 Pages 发布已由作者明确授权。

## 内容与私有信息

- [ ] 对照 `git status --short` 审阅要提交的文件，保留与当前版本相关的更改。
- [ ] `.signing/`、`signing.local.properties`、`local.properties`、`*.jks`、`*.keystore` 不进入版本控制、源码包、附件或日志。
- [ ] 不公开 `build/device-backups/`、ADB 设备导出、个人课表、真实教师地点、用户图片或原生偏好快照。
- [ ] `docs/images/` 只含经核对的示例画面；当前课程截图使用合成课程、教师和教室。
- [ ] 依赖许可、`THIRD_PARTY_NOTICES.md`、品牌资源说明与所包含资产一致。
- [ ] README 不包含虚构仓库链接、未建立的下载链接或无证据的 CI 通过徽章。

## 验证与包身份

- [ ] `web/src/meta.ts`、`package.json`、发行说明和 APK 版本一致。
- [ ] `npm run build` 与 `npm run check` 通过。
- [ ] `check-delivery-integrity.mjs` 通过，确认功能实现仍与输入交付包一致。
- [ ] 首次引导、导入、课程编辑、背景、玻璃范围、键盘、日期和返回检查通过；失败或跳过的项目在验证记录中明确注明。
- [ ] Android debug / release 构建与 lint 完成；只将实际完成的结果写入 STATUS。
- [ ] 正式 APK 包名是 `com.dolphin.calendar`，使用原发行签名；版本码相对上一正式版递增。
- [ ] 运行 `scripts/check-release.ps1` 与旧正式 APK 对比身份；记录校验结果与 SHA-256。
- [ ] 单独记录 `adb install -r` 覆盖安装和数据连续性的实际证据；包名、签名检查不等同于设备安装测试。
- [ ] 确认发行签名由所有者安全保管，公开 CI 只构建调试包，不接触原密钥。
- [ ] 实机尚未核对的通知外观、ROM 行为或帧率单独说明，不用模拟器检查替代对应手机证据。

## 实际发布

- [ ] 只推送审核通过的代码、文档和允许公开的资源。
- [ ] 需要 Release 时上传审核过的 APK、源码、网页和 SHA-256 清单，检查名称及版本。
- [ ] 在页面确认文件可下载、校验值正确，才将真实仓库 / Release 链接补到 README。
- [ ] 对 GitHub Actions 的实际运行结果进行核对，再展示相应状态。
- [ ] 最终通知作者发布位置、附件与尚未完成的设备核对事项。
