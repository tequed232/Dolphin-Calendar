# 源码准入规则

私有仓库 `tequed232/Dolphin-Calendar` 只接收维护及构建项目所需的源码、配置、脚本、测试、文档、第三方许可和工程资源。正式图标、默认背景、Material SVG 与合成演示截图属于项目资源；Gradle Wrapper 的启动 JAR 是明确允许的构建工具例外。

## 规则文件

[source-policy.json](../source-policy.json) 维护允许路径、允许模式、禁止目录、禁止文件类型和完整源码的必需文件。未知类型默认拒绝，禁止规则优先；唯一 JAR 例外是 `gradle/wrapper/gradle-wrapper.jar`。符号链接、子模块和特殊文件不准入。

APK / AAB、ZIP / 其他归档、编译产物、依赖与缓存、IDE 配置、签名密钥、本机 SDK / 签名配置、环境文件、数据库及备份、日志、原始提示词禁止入库。规则检查文件路径与 Git 模式，不会把任意 JSON 或源码内容自动判定为安全；仍须审阅文件内容，避免把用户数据或凭据写进允许的源码类型。

## 安装及检查

首次克隆后显式安装钩子，安装只修改当前克隆的 Git 配置；`npm ci` 不擅自替换已有钩子：

```powershell
npm run hooks:install
npm run check:source-files
node scripts/check-source-files.mjs --staged
node scripts/check-source-files.mjs --ref HEAD
```

- `pre-commit`：只检查 Git 暂存索引中的新增、修改及重命名条目，不用工作树内容替代实际将提交的文件。
- `pre-push`：检查推送端点的完整源码及新增提交历史。将 APK 加进早期提交、之后再删除，也不能通过。新建远端分支时检查完整可达历史，不用可能过期的本地远端跟踪引用作为豁免基线。已有目标远端提交不在本地时先执行 `git fetch`。
- `npm run check`：同时运行准入检查、自检、业务源码守卫、资产及解析测试。
- 独立快照：`node scripts/check-source-files.mjs --directory 路径`，检查所有文件与必需路径，不忽略隐藏文件或未跟踪文件。
- CI：`Source admission` 在 push、pull request 和手动触发时严格检查完整提交树和新增提交历史，不安装 npm 依赖也可执行。

旧本地工作树默认检查可警告已被 HEAD 跟踪的 `.idea`、`.run` 和原提示词，以保留历史开发环境；严格提交树、暂存区及独立目录没有这项豁免。它们不会进入本次新仓库。

`.gitignore` 负责减少误添加，允许列表与钩子负责校验；克隆后需自行安装钩子，钩子可能被绕过，CI 在 GitHub 接收提交之后报告失败。当前账号的私有仓库 Rulesets 接口返回需要升级 GitHub Pro，故没有设置 GitHub 服务端硬拒绝规则。仓库保持 Private；不更改账号套餐或对外公开。

维护者添加新文件类型或目录时需审阅并更新策略。策略与工作流本身可由拥有写权限的人修改，不能代替 GitHub 访问控制。
