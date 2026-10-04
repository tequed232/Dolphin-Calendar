# 第三方组件说明

项目自己的业务代码未在本文件指定开源许可证，发布方式由项目所有者决定。

| 组件 | 用途 | 许可证 |
|---|---|---|
| React / React DOM 19.1.1 | Web 界面 | MIT，完整文本见 `legal/REACT-LICENSE.txt` |
| Material Symbols（Google），通过 @material-symbols/svg-400 0.47.5 分发 | 27 个本地 Rounded SVG | Apache-2.0，完整文本见 `web/src/assets/icons/LICENSE` |
| AndroidX WebKit 1.12.1 / Core 1.15.0 | 安全本地 WebView、FileProvider、系统兼容 | Apache-2.0 |
| Kotlin 2.0.21 | Android 宿主 | Apache-2.0 |
| Vite 7.3.6 | 开发与构建工具 | MIT |
| TypeScript 5.9.2 | 类型检查 | Apache-2.0 |
| Playwright 1.55.1 | 本地验证工具 | Apache-2.0 |
| shuding/liquid-glass | SVG 位移贴图折射思路，Dock 几何与生命周期重新实现 | MIT，见 `legal/LIQUID-GLASS-LICENSE.txt` |
| Miuix 文档 | 共享 Web 主题的语义色参考，未链接 Compose 组件依赖 | Apache-2.0 |

完整依赖版本与来源由 package-lock.json 和 Gradle 配置锁定。Apache-2.0 正文见 `legal/APACHE-2.0.txt`。Material Symbols 图标上游为 https://github.com/google/material-design-icons ，分发工具为 https://github.com/marella/material-symbols 。图标经过子集选择，图形路径未修改。

应用品牌 PNG 由用户提供，不属于 Material Symbols。启动器、应用内与 ColorOS 实时通知使用此图的原图或等比例缩放版本；旧占位品牌图已移除。等高线依赖及生成资产已按用户要求在 1.3.0 移除。

默认背景插画由用户于 2026-10-03 提供，原图内置于 `web/src/assets/backgrounds/default-background.png`，不属于 Material Symbols 或开源组件素材。
