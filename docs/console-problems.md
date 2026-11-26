# 控制台问题提示

控制台用一个通用小窗解释正在影响使用的问题，并列出用户可以检查的项目和可执行的操作。
小窗与工具箱窗口使用同一窗口外框（`ConsoleFloatingWindow`），显示在画面中央，不加遮罩，
画面和工具栏照常可用；标题栏的关闭按钮关闭它。提示类窗口不用 modal。新增问题只写定义，不新增组件。

## 结构

| 文件 | 作用 |
| --- | --- |
| `src/lib/console-problems.ts` | `ConsoleProblem` 定义、`createProblemTracker`、`recentInput`／`recentPress` |
| `src/lib/console-problem-registry.ts` | `CONSOLE_PROBLEMS` 注册表，越靠前优先级越高 |
| `src/components/ConsoleProblemWindow.vue` | 通用小窗，由 `AppShell` 挂载在控制台画面区域 |
| `src/lib/usb-input-problems.ts` | USB 键鼠未连接、键鼠没有响应两项定义 |

## 定义

| 字段 | 含义 |
| --- | --- |
| `id` | 唯一标识 |
| `title`、`intro`、`checks`、`note` | 文案函数，显示时读取，跟随当前语言；`note` 写操作的中断影响等必要事实 |
| `icon` | 可选图标组件 |
| `actions` | 按钮；`run()` 可返回成功提示，成功后关闭小窗；失败显示 `failure()` |
| `active(context)` | 问题仍然存在 |
| `relevant(context)` | 是否提示当前用户；省略时对所有观看者提示 |

`context` 包含当前状态 `status`、本浏览器最近一次发送键鼠报告和按键／点击的时间
`input`，以及 `now`。`recentInput` 和 `recentPress` 判断 5 秒内是否有输入，用于只提示
正在操作的用户。

## 行为

- 同时存在多个问题时显示注册表中最靠前且需要提示的一项；正在显示的问题保持到它消失
  或被关闭。
- 问题消失后小窗自动关闭。关闭后，同一问题在消失前不再弹出；消失后再次出现会重新提示。
- 未登录、视频回退提示显示中或高级设置打开时不显示。
- 问题的判断依据应来自服务端状态中的事实字段，文案和弹出条件留在前端。

## USB 键鼠

| id | 条件 | 提示对象 |
| --- | --- | --- |
| `usb-input-disconnected` | `hid.available` 且未 `connected` | 5 秒内按键、点击、滚轮或手柄按键的用户；只移动指针不提示 |
| `usb-input-stalled` | 已连接且 `hid.write_stalled` | 5 秒内发送过任何键鼠报告的用户 |

`hid.write_stalled` 由 Core 在键鼠报告持续超时 1 秒以上且期间没有一次成功写入时置位，
下一次成功写入或重置 USB 后清除。两项都提供“重置 USB”操作。
