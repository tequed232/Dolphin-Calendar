# 发布检查清单

作者已创建 [tequed232/Dolphin-Calendar](https://github.com/tequed232/Dolphin-Calendar)，并明确要求上传当前项目与设置源码准入规则。此次范围是 **Private 仓库的 `main`、1.4.1 稳定版源码**。保留仓库初始提交与作者选择的 GPL-3.0 `LICENSE`；不创建 Release，也不上传本机安装包或归档。以下清单作为后续维护与发行核对使用，不代表每项都已执行。

## 源码准入与本次上传方式

规则入口是 [source-policy.json](../source-policy.json)，使用方式见 [源码准入说明](SOURCE_POLICY.md)。接收业务源码、构建配置、脚本、测试、项目文档、第三方许可及工程资源。Gradle Wrapper 的 JAR 是启动构建工具的唯一 JAR 例外。APK、ZIP、编译产物、依赖、缓存、IDE 配置、密钥、本机配置、用户数据库、ADB 备份和原始提示词均禁止入库。

`scripts/prepare-publish.ps1` 在本项目 `build/publish/` 下生成新快照并严格校验，不覆盖已有目录。独立快照获取远端 `main`，以远端提交为父提交、保留其 `LICENSE`，再快进推送；不推送本机原仓库的历史或其他工作树。`gradlew` 与 `.githooks/pre-*` 在 Git 中记为可执行文件。上传后比较远端完整树的路径、模式与 blob SHA。

首次克隆后运行 `npm run hooks:install`。`pre-commit` 检查暂存区，`pre-push` 检查推送提交树，GitHub Actions 在 push / pull request 上检查完整树，工作流不上传构建附件。钩子需要安装且可能被绕过，CI 在接收提交之后报告结果；这些检查不等同于 GitHub 服务端拒绝上传。新增文件类型须先审阅并修改准入策略。

## 作者审核

- [ ] 审阅 README：项目定位、功能路径、JSON 示例、能力边界和作者链接符合实际。
- [x] 保留作者初始化仓库时选择的 GPL-3.0 `LICENSE`，项目说明与该选择保持一致。
- [ ] 品牌 PNG、默认背景插画按作者提供的项目资源使用，独立于业务代码许可证；文档说明素材不自动获得再分发或再许可。
- [ ] 确认拟发布的仓库名称、公开或私有、分支、版本与发布说明。
- [x] 本次上传已由作者明确授权：现有 Private 仓库、当前源码、源码准入规则；额外发行附件仍须按具体请求处理。

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
- [ ] 首次引导、导入、课程编辑、背景、玻璃范围、键盘、日期和返回检查通过；失败或跳过的项目在验证记录中明确注明。
- [ ] Android debug / release 构建与 lint 完成；只将实际完成的结果写入 STATUS。
- [ ] 正式 APK 包名是 `com.dolphin.calendar`，使用原发行签名；版本码相对上一正式版递增。
- [ ] 运行 `scripts/check-release.ps1` 与旧正式 APK 对比身份；记录校验结果与 SHA-256。
- [ ] 确认发行签名由所有者安全保管，公开 CI 只构建调试包，不接触原密钥。
- [ ] 实机尚未核对的通知外观、ROM 行为或帧率单独说明，不用模拟器检查替代对应手机证据。

## 批准后的实际发布

- [ ] 只推送审核通过的代码、文档和允许公开的资源。
- [ ] 需要 Release 时上传审核过的 APK、源码、网页和 SHA-256 清单，检查名称及版本。
- [ ] 在页面确认文件可下载、校验值正确，才将真实仓库 / Release 链接补到 README。
- [ ] 对 GitHub Actions 的实际运行结果进行核对，再展示相应状态。
- [ ] 最终通知作者发布位置、附件与尚未完成的设备核对事项。
