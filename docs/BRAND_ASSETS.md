# 美术资源交接

当前统一使用用户最新提供的 `file_00000000d2588230a0c60edf578127dc.png`，原图为 1084×1084 透明 PNG。网页与 Android 保留同一原图，SHA-256 为 `7ef13436c24ec589628b140098e518efb0027f04ec78cae58f1cdbbc3ee81d4d`；旧占位品牌图与海豚剪影已替换。

后续更换品牌稿时统一检查以下入口：

| 位置 | 源文件 | 建议交付 |
|---|---|---|
| 网页与 APK 内的品牌标志 | `web/src/assets/brand/app-icon.png` | 透明底 PNG，等比例使用；轮廓在 24–48 px 可辨识 |
| Android 启动器与彩色大图标 | `app/src/main/res/drawable-nodpi/app_icon.png` | 同一原图；检查圆形与圆角启动器裁切 |
| ColorOS 系 Android 16 导航实时通知 | `app/src/main/res/drawable-nodpi/live_icon.png` | 原图等比例缩至 256×256，保留透明度，绑定本地资源 |
| 普通 Android 状态栏与提醒 | `app/src/main/res/drawable/ic_notification.xml` | 同品牌的单色兼容轮廓，由系统着色；避免彩图被染成方块 |

通用按钮使用本地 Material Symbols Rounded 子集；它们不依赖品牌稿，不请求在线图标字体。

`scripts/prepare-brand.ps1` 只生成需要的尺寸与兼容资源；功能按钮仍使用本地 Material Symbols。用户教材封面属于业务数据，不随品牌图更换删除。替换后检查浅/深色、通知小图标、圆形/圆角启动器裁切与首次离线启动。ColorOS 对彩色资源的最终呈现需要对应手机核对。
