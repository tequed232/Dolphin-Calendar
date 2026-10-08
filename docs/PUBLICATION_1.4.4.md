# 1.4.4 发布完成记录（2026-10-08）

正式版本 [v1.4.4 Release](https://github.com/tequed232/Dolphin-Calendar/releases/tag/v1.4.4) 已发布并标为 Latest，非草稿、非预发布。标签固定在发行提交 `ab40ce6fc4ed7931c21d363c04f74f53d4c75672`；原 v1.4.3 Release 及 APK 保留。上传的正式 APK、网页 ZIP、源码 ZIP、验证 ZIP 和 SHA256SUMS.txt 均通过 GitHub 附件大小及 SHA-256 与本地文件的逐项比较。

正式 APK 为 `com.dolphin.calendar`、1.4.4 / 10404，使用原发行签名。其 SHA-256 为：

```text
bbfcbd51895dd04d3e6a2e29e8ad1c4b04acc686ba5c43a2307464c2ade6c754
```

覆盖安装和数据保留的实际测试范围见 [STATUS.md](STATUS.md)。源码归档来自发行标签提交，严格准入检查 225 个文件；远端提交树与本地提交树的路径、模式和 blob SHA 全部一致。后续仅修正浏览器测试长按的时序与发布文档，标签和正式 APK 保持原发行内容，功能源码一致性检查继续核对交付包的 123 个文件。

## GitHub 验证

[v1.4.4 标签的完整验证](https://github.com/tequed232/Dolphin-Calendar/actions/runs/37778417022) 结论为 success，浏览器 20/20 组、241 条 PASS 输出；网页构建、数据及工程检查、Android Debug 构建、2 项 JVM 单测和 lint 全部通过。本地 Debug / Release lint 均为 0 错误、29 警告。

同一发行提交的 [main 并行运行](https://github.com/tequed232/Dolphin-Calendar/actions/runs/37778402742) 记录为 19/20：时间线组长按后未出现预期的两个把手。核对发现测试在关闭详情后复用了旧坐标，且在已安装模拟时钟的情况下用真实等待处理长按，只留 50 ms 余量。测试随后改为等待详情退出、重新获取交点、确认课程命中并推进模拟时钟，保持松手前后两个把手及 Resize 保存的严格断言；本地针对补跑 11 项、0 浏览器错误。原日志没有失败坐标，不能区分两处时序风险中的具体触发因素。失败日志保留，不将该运行写成一次通过。

## Pages 与线上检查

[Pages 工作流](https://github.com/tequed232/Dolphin-Calendar/actions/runs/37778402819) 的 build 与 deploy 已成功。[在线页面](https://tequed232.github.io/Dolphin-Calendar/) 显示 V1.4.4，列表 / 平铺 / 搜索 / 设置均实际打开。线上 index.html 与本轮本地发布构建逐字节一致，SHA-256 为 `2ecea3139a32175e8e8339b761e3bee37b5bf0728b7c27c9c06cafbbd76d4135`。Service Worker 的缓存名称含构建时间，独立工作流的缓存名称可能不同；这里的字节比较针对实际入口文件。

本轮真实网页版本检查遇到当前网络的 GitHub 匿名 API 限额：HTTP 403，X-RateLimit-Remaining 为 0，应用显示“暂时无法检查更新，请稍后重试”。通过已认证 GitHub 连接读取 latest Release 确认为 v1.4.4；这与匿名网页请求是不同的连接条件。课程和页面仍正常使用，未修改功能实现或在网页嵌入访问凭据。测试的受控 API 成功、无更新及失败分支已通过；本轮不能把实际匿名请求写成成功。

Release 下载和 Pages 发布已完成；厂商 ROM 后台通知/每日调度、系统下载与真实手机文件选择器继续保留设备验收边界。
