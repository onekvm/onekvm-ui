# OneKVM UI

[English](README.md) | 简体中文

OneKVM 的 Vue 3 Web 界面，将低延迟远程控制台、设备管理、扩展管理和首次
初始化整合为一个响应式应用。

## 主要功能

- WebRTC 音视频，支持 MJPEG，并可在 WebRTC 连接失败时切换到 H.264/H.265
  WebSocket 视频回退
- 通过 HID 控制键盘和五键鼠标，支持绝对/相对鼠标、文字输入、键盘布局和
  可复用快捷键
- ATX 电源控制、全屏键盘锁，以及支持 ISO 上传和可写虚拟磁盘文件管理的
  虚拟介质
- 首次启动时完成账户、网络、语言、时区和 NTP 初始化
- 网络、VLAN、WireGuard、DNS、静态路由、USB 标识、视频、服务、用户、
  在线会话、日志、资源、时间、更新与恢复管理
- 扩展目录、安装、配置、生命周期、健康恢复，以及 HTML、Layout、Vue
  三种扩展页面
- 基于权限的导航，以及面向品牌化构建的产品接口
- 英文、简体中文和繁体中文界面
- 独立的 Recovery UI 构建，提供固件刷写、重置默认用户和重启

## 运行架构

浏览器通过 OneKVM Core 的 HTTP API 和状态事件流工作。WebRTC 使用
`control` DataChannel 发送 HID 报告；MJPEG 和 WebSocket 视频回退使用独立
HID WebSocket。回退所需的 Muxer、高级设置和关闭状态的抽屉均按需加载，
以缩短控制台启动路径。

生产版本适合由 OneKVM Core 同源提供。高级设置使用
`#/settings/advanced/system` 这样的 Hash 路由，静态服务器不需要配置
History 路由回退。

## 环境要求

- 推荐 Node.js 20 LTS 或更高版本
- 支持 lockfile 9 格式的 pnpm
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

传输、网络、更新或恢复相关修改还需要连接实际设备测试，因为浏览器端类型
检查无法验证 Core 协议兼容性和断线重连行为。

## 许可证

本项目使用 GNU General Public License v3.0，完整条款见
[LICENSE](LICENSE)。
