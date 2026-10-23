# OneKVM UI

[English](README.md) | 简体中文

OneKVM 的 Vue 3 Web 界面，将低延迟远程控制台、设备管理、扩展管理和首次
初始化整合为一个响应式应用。

## 主要功能

- 低延迟远程控制台，支持 WebRTC 音视频、MJPEG 视频以及 H.264/H.265 WebSocket 视频传输。
- 键盘、鼠标、游戏手柄和文字输入控制，支持鼠标模式、键盘布局、快捷键及键盘锁。
- 虚拟介质，支持 ISO 上传/下载、可写虚拟磁盘和文件管理。
- 首次初始化和设备管理，涵盖账户、网络、显示、服务、安全、用户、诊断、更新与恢复。
- 扩展发现、安装、配置和生命周期管理，支持 HTML、Layout 和可信 Vue 扩展页面。
- 响应式、基于权限的界面，支持浅色/深色主题、英文、简体中文和繁体中文，以及产品集成接口。
- 独立的 Recovery UI，提供固件安装、重置用户、恢复出厂设置和重启。

## 运行架构

浏览器通过 OneKVM Core 的 HTTP API 和状态事件流工作。视频使用 WebRTC，
必要时可使用 MJPEG 或 WebSocket；HID 报告会根据当前视频模式选择传输方式。

生产版本适合由 OneKVM Core 同源提供。高级设置使用
`#/settings/advanced/system` 这样的 Hash 路由，静态服务器不需要配置
History 路由回退。

## 环境要求

- Node.js 22.6 或更高版本
- pnpm 9 或更高版本
- 使用 API 功能时需要兼容的 OneKVM Core

## 本地开发

安装依赖并启动 Vite：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

浏览器始终向 Vite 同源发送 API、事件流、WebSocket 和 WebRTC 信令请求。
需要连接另一台设备时，创建 `.env.development.local`，由 Vite 将请求代理到
OneKVM Core：

```dotenv
ONEKVM_DEV_PROXY_TARGET=http://192.0.2.10
VITE_WITH_CREDENTIALS=true
```

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `ONEKVM_DEV_PROXY_TARGET` | 空 | Vite 开发代理使用的 OneKVM Core Origin |
| `VITE_WITH_CREDENTIALS` | `true` | 浏览器请求携带认证 Cookie |

Vite 会代理 `/api` 和 `/plugins`，包括 SSE 响应和 WebSocket Upgrade。浏览器
始终保持同源，因此不需要修改 Core 的 CORS。`secure: false` 允许开发环境
连接使用自签名 HTTPS 证书的设备，不会改变生产环境的 TLS 校验。

需要从局域网内另一台电脑打开开发 UI 时，运行
`pnpm dev --host 0.0.0.0`；请只在可信网络中使用。

## 常用命令

```sh
pnpm dev            # 在 3001 端口启动开发服务器
pnpm dev:recovery   # 在 3002 端口启动 Recovery UI
pnpm check          # 执行 Vue 和 TypeScript 类型检查
pnpm build          # 类型检查并生成控制台和 Recovery 生产包
pnpm build:recovery # 只生成 Recovery 生产包
pnpm preview        # 本地预览 dist/
pnpm test:recovery  # Recovery API 与语言包测试
```

项目还提供 `pnpm test:*` 形式的专项回归测试；请根据修改范围运行相关测试。

生产文件输出到 `dist/`。Recovery 是第二次 Vite 构建，把 JS/CSS 内联进
`dist-recovery/index.html`，供 initramfs 网页服务器使用。该页面提供固件刷写
（`.fwup` 更新包或完整 `.img`）、重置默认用户、恢复出厂设置和重启，并支持
跟随系统 / 浅色 / 深色外观。

## 目录结构

```text
src/
├── api/          OneKVM Core 类型化客户端和 API 模型
├── components/   控制台、初始化、设置和管理页面
├── composables/  认证、传输、视频、键盘和鼠标状态
├── extensions/   可信扩展 Vue 页面宿主运行时
├── i18n/         语言检测、按需词典和翻译运行时
├── input/        HID 键盘映射和文字转换
├── lib/          传输、网络、视频、快捷键和通用模块
├── product/      可选产品集成边界
└── recovery/     独立 Recovery UI（固件、重置用户、出厂设置、重启）
```

`App.vue` 安装共享的 Naive UI Provider，`AuthGate.vue` 负责首次初始化和
登录，`AppShell.vue` 在远程控制台与高级设置工作区之间切换。

## 扩展页面

OneKVM 扩展可以提供：

- 沙箱化 HTML 页面；
- 由设置 Schema 驱动、宿主渲染的 Layout 页面；
- 复用宿主 Vue 和 Naive UI 运行时的可信 Vue 页面。

可信 Vue 接口见 [Extension Vue Page API v1](docs/extension-vue-page-v1.md)。
扩展页面只能访问自身资源、设置、路由和 manifest 声明的 Controller 方法。

## 产品构建

`src/product/` 中的基础实现不增加品牌标识或额外设置。产品构建可以在组成
临时源码树时替换该目录，从而提供：

- 根据已认证设备计算的品牌 Badge；
- 额外的用户归属信息；
- 受权限控制的设置页面。

产品专属行为应保留在该接口之后，确保基础 UI 始终能够独立构建。

## 国际化

英文作为内置回退词典，中文词典按需加载。新增应用文案时应同步修改三个
Locale 文件，并通过 `t()` 运行时读取，避免在共享组件中直接写用户可见
文字。扩展自身的翻译应保留在扩展仓库内，不加入本 UI。

## 验证

交付修改前运行：

```sh
pnpm check
pnpm build
git diff --check
```

涉及行为的修改还应运行相关的 `pnpm test:*` 专项测试。

传输、网络、更新或恢复相关修改还需要连接实际设备测试，因为浏览器端类型
检查无法验证 Core 协议兼容性和断线重连行为。

## 许可证

本项目使用 GNU General Public License v3.0，完整条款见
[LICENSE](LICENSE)。
