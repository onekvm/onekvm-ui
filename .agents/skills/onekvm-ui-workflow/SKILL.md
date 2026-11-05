---
name: onekvm-ui-workflow
description: 修改 OneKVM Vue 界面，包括布局、Naive UI、主题、翻译、设置表单和交互状态。
---

# OneKVM 界面

1. 先找现有页面、组件和 API 绑定，沿用 Vue 3 `<script setup>`、项目组件及 Naive UI 的既有写法。
2. 同步维护 `src/i18n/locales/en.ts`、`zh.ts`、`zh_tw.ts`，并检查浅色、深色及窄屏状态。翻译单独打包为 `onekvm-l10n-en`、`onekvm-l10n-zh`、`onekvm-l10n-zh-tw`；部署文案改动时与 `onekvm-ui` 一起安装相同构建版本的语言包，再刷新浏览器验证。
3. 优先使用 `src/theme/` 的颜色与状态定义；加载、空值、失败和折叠动画应与同页交互一致。
4. 运行相关构建或类型检查；涉及设备行为时再用实机核对，不以静态页面代替验证。
