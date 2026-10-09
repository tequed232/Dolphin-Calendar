# 参考项目与实现核对

## 1.4.5 当前实现

旧透明 Dock 已退休，Android 使用平台原生 View，网页使用对应底栏/侧栏；未引入旧参考库的 Compose 组件。对话框、输入法和导航占位按当前响应式实现处理，下文关于透镜、固定 Dock 的内容仅为历史参考。当前说明见 [UI_1.4.5.md](UI_1.4.5.md)。


参考工程：用户指定的 `D:/Desktop/Projects/01-课表应用/duofen-kebiao/`。原工程只读，未修改其文件或安装包。

## 保留思路，重新实现

- `MainActivity.kt`：区分 capture 与普通选图；相机使用 FileProvider 输出 URI，处理成功但返回 Intent 为空的情况。
- `scheduleJson.ts`：应用二维形状与扁平课程形状统一；旧版 `period`、`termStart`、教师/星期别名兼容。
- Gradle：版本号由前端 meta 文件派生；打包时同步同一份前端构建。
- WebView 调试与 ADB + Playwright 真机 DOM 验证。

## 没有照搬

- 旧工程的返回预览已经整体移除。新工程按 TXT 重建原生边缘输入与网页层预览；用户确认保留目前观感，仅将收拢中心改到触发位置附近。
- 旧版通知使用 `setColorized(true)`，不符合当前官方实时通知条件。新版不使用这一设置。
- 旧的静默跳过错误课程会丢数据。新版对出错课程给出条目编号与明确原因，确认前不会覆盖原课表。
- 旧功能遗留的识别相关描述、图片分析接口和资源没有迁移。

## 官方参考

- [AndroidLiquidGlass LiquidBottomTabs](https://github.com/Kyant0/AndroidLiquidGlass/blob/kmp/app/src/commonMain/kotlin/com/kyant/backdrop/catalog/components/LiquidBottomTabs.kt)：1.4.0 重新核对当前 kmp 示例的背景/前景分层、有限拖动值、独立按压放大与动画归位；移植原则到现有 WebView。完全模式扩展统一半透明材质，复杂位移仍限定底栏。未直接引入 Compose 原生库。

- [Android Calendar Provider](https://developer.android.com/guide/topics/providers/calendar-provider)：用本地日历账户写入课程，填写开始/结束时间、时区、地点与说明。日历权限按用户操作申请。
- [Material Design 3 Icons](https://m3.material.io/styles/icons/overview)：主页快捷操作沿用本地 Material Symbols Rounded，新增 `today` 和 `near_me`；没有引入远程图标字体。
- [Miuix 颜色系统](https://compose-miuix-ui.github.io/miuix/zh_CN/guide/colors)：曾评估其配色，但按用户后续反馈恢复 Dolphin Calendar 首版界面；React 页面不引入未使用的 Compose 组件。
- [Miuix 背景效果](https://compose-miuix-ui.github.io/miuix/zh_CN/guide/blur)：Compose 的纹理背景与着色器接口不可直接用于 DOM。
- [shuding/liquid-glass](https://github.com/shuding/liquid-glass)：参考以 SVG 位移贴图折射真实背景的思路；当前只在 Dock 选中胶囊上使用静态位移贴图，整个 Dock 使用轻模糊，避免滚动时大面积滤镜闪烁。纹理只随尺寸变化生成，不跟随触摸逐帧生成。MIT 文本已保留。

- [Android 实时通知](https://developer.android.google.cn/develop/ui/views/notifications/live-update?hl=zh-cn)：标准样式、ongoing、提升请求与使用条件。
- [Android 提升请求字段](https://developer.android.google.cn/reference/android/app/Notification#EXTRA_REQUEST_PROMOTED_ONGOING)：常量值 `android.requestPromotedOngoing`；在 API 36 编译环境下使用等值 Bundle 键。
- [ColorOS 流体云模板](https://open.oppomobile.com/documentation/page/info?id=12658)：通过网页动态渲染核对正文，确认其为潘塔纳尔服务的 OML 卡片模板，并非 Android 通知 extras。realme Android 16 已实测通过系统“流体云显示实时活动”开关提升标准实时更新；这不代表获得 OML 专用卡片接入资格。
- [OPPO 泛在服务快速开始](https://open.oppomobile.com/documentation/page/info?id=12639)：接入需向 OPPO 提供产品场景并申请授权码、意图与服务 ID，使用 Pantanal DevStudio 构建服务。
- [OPPO 服务发布](https://open.oppomobile.com/documentation/page/info?id=12715)：服务库定邀测试，要求企业认证、商务申请和平台评估；未经开通无法发布真实流体云卡片。
- [小米超级岛开发指南](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2131)：客户端通知扩展与权限查询。
- [小米超级岛接入流程](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2132)：即使只在本地发送，正式超级岛权限也需要开发者服务开通和场景审核。没有账号与审核结果时不能承诺正式上岛。
- [Playwright 浏览器说明](https://playwright.dev/docs/browsers)：系统 Chrome 对应 `chrome` 渠道；`chromium` 表示 Chromium 新无头模式。此机未找到标准安装位置的 Chrome，因此守卫用 `channel: chromium` 和本机已有 Chromium 可执行文件，不另下载浏览器。

## 1.2.1 等高线背景

参考并使用 https://github.com/AlexGordienko/contour-field 的静态 SVG 输出。历史 1.2.1 使用 contour-field 0.2.0，仅作为构建依赖，用高斯高度场和 marching squares 生成连续等高线。应用只携带生成图形，不加载交互版或 WebGL 帧循环；旧版 MIT 授权随当时发行包保留；1.3.0 按用户要求移除生成图形、依赖与当前资产。浅深色分别核对，背景开关兼容已有 contour=0 的关闭状态。

## 1.2.4 WebView 输入法

核对 [Android WebView 窗口 Insets 文档](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)。WebView 的布局视口与视觉视口不同，M139 起键盘会影响视觉视口；处理键盘不能混用系统安全区，也不能因 resize 丢失编辑焦点。本项目保留 Insets 传递，分别传递安全区、键盘和完整窗口高度，让页面与弹窗避让，Dock 保持底部定位。

## 1.3.0 系统日历节假日

依据 [Android Calendar Provider](https://developer.android.com/identity/providers/calendar-provider) 读取用户指定日历；来源表区分可见日历，Instances 展开重复事件。读取只申请 READ_CALENDAR，写入权限仍仅用于既有系统日历导入/复原功能。节假日没有通用的 Android 休/补类型字段，当前实现依据所选来源的明确标题进行标记，不将普通节日名称推断为停课或调课。
