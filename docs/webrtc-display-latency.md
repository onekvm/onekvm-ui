# WebRTC 浏览器显示延迟

## 指标口径

性能面板的 `presentUs` 来自 `requestVideoFrameCallback`：

```text
expectedDisplayTime - receiveTime
```

它是浏览器收到完整视频帧到预计显示的总时间，包含 jitter buffer、解码、
renderer queue 和合成调度。延迟图为了避免重复堆叠，将“显示开销”画成：

```text
max(0, presentUs - jitterBufferUs - decodeUs)
```

性能面板右上角的合计是管线已测小计：capture + encode + present。ICE RTT
是链路诊断指标，不作为单向延迟直接相加。各浏览器指标使用独立的一秒窗口，
单点允许有少量偏差。该合计不是 glass-to-glass。

## 2026-09-04 低延迟修复

107 的旧生产页面在 1920x1080 H.264 下观测到：

```text
capture                 23 ms
encode                  9.1 ms
jitter buffer           23 ms
decode                  1.7 ms
total measured         104 ms
derived receive→display 71.9 ms
derived display overhead 47.2 ms
```

浏览器暴露了 `jitterBufferTarget` 和 `playoutDelayHint`，旧代码因 `else if` 只写
前者，后者一直为 `null`。同时，动态控制器把 NanoKVM 编码器的分片突发造成的
RTP jitter（局域网无丢包时也会短暂到约 20 ms）乘以 2.5，视频 target 一度从
14 ms 升到 60–76 ms，并以每三秒 4 ms 的速度缓慢回落。

修复后：

- Chromium 同时暴露两个接口时，两者都会配置；视频
  `playoutDelayHint=0` 明确选择低延迟 renderer。
- 标准 `jitterBufferTarget` 继续动态工作。视频在零丢包、零 NACK/PLI/丢帧/
  freeze 时保持 0，由浏览器保留其固有最小缓冲；真实恢复事件会立即增加保护，
  稳定后每秒最多回落 8 ms。
- 音频仍按 RTP jitter 动态调整，并保留 20 ms 下限，避免把视频优化变成音频断流。
- 性能浮窗不再对实时视频执行 `backdrop-filter: blur(10px)`，消除每帧的背景
  重采样与额外合成 pass。

最终生产 IPK 在 107 的 HTTPS 页面验证：

```text
video jitterBufferTarget       0 ms
video playoutDelayHint         0 s
current FPS                    60
jitter buffer                  21 ms
decode                         2.2 ms
total measured                 72 ms
derived receive→display        39.9 ms
derived display overhead       16.7 ms
performance backdrop-filter   none
```

同一页面连续 300 个 `requestVideoFrameCallback` 样本中，receive→display 平均
37.89 ms、p50 39.6 ms、p90 56.9 ms；解码平均 2.2 ms。自动化浏览器的回调调度
和软件合成不能代表用户机器的掉帧率，因此验收以浏览器 RTC stats、页面 FPS 和
设备 VENC/VPSS 60 FPS 共同判断。

## 2026-09-04 RTP playout-delay 协商

接收端 target 设为 0 后，Chromium 仍会在无丢包局域网保留约 30 ms 原生视频
jitter buffer。进一步检查实际 SDP 发现，浏览器 offer 已提供：

```text
a=extmap:5 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay
```

Rust WebRTC answer 未注册任何视频 header extension，因此没有回显该 extmap，RTP
也无法携带发送端的低延迟上限。Go 与 Rust 都按 access unit 批量发送 RTP 分片，
不能把整帧 `sendmmsg` 单独判定为 Rust 回归；改动保留现有分片、SRTP CryptoDMA
offload 和 UDP batch，只为 sendonly 视频注册该扩展，并在每个 sample 上携带
`min=0, max=0`。

107 部署 `onekvm-core 0.1.0-r106.debug20260904055014` 后，answer 正确回显同一
`extmap:5`。1920x1080 H.264 60 FPS 连续 15 秒、902 帧 RTC stats 窗口为：

```text
jitterBufferTarget            0 ms
playoutDelayHint              0 s
jitter buffer average         1.76 ms
jitter buffer range           1.49–2.16 ms
RTP jitter average            5.07 ms
frame assembly average        1.72 ms
total processing average      3.85 ms
packet loss / NACK / PLI      0 / 0 / 0
frames dropped                0
page total measured latency   42 ms
```

同一连接随后连续 600 个 `requestVideoFrameCallback` 样本中，完整帧
receive→display 平均 `6.19 ms`、p50 `6.5 ms`、p90 `11.5 ms`；对应 RTC
stats 的 jitter buffer 为 `1.70 ms`、decode 为 `2.27 ms`，仍为 0 丢包、0
NACK/PLI、0 丢帧。

设备日志同时确认 `SRTP TX offload active provider=nanokvm CryptoDMA AES-GCM` 和
`UDP transmit batching active: sendmmsg`，说明降低缓冲没有以关闭硬件 SRTP 或
批发送为代价。

## 与 HDMI latency clock 的口径差异

性能面板不是 glass-to-glass 测量。`kvm-latency-clock` 的时间文本从 99 的 GTK/
Wayland 桌面经过 HDMI 扫描、LT6911/CSI、VI/VPSS/VENC、RTP、浏览器解码和最终
呈现，覆盖整条链路；页面只能累加设备已暴露的 MMF 估算和浏览器收到完整帧后的
统计。

同一连接用浏览器 canvas 同步冻结当前视频帧和浏览器 `Date.now()`，OCR 读取画面
内的 99 Unix 毫秒，连续 12 次原始差值为 `92–105 ms`，平均 `99.17 ms`、p50
`100 ms`、p90 `104 ms`。通过已建立的 SSH control connection 采样两机时钟，
99 约快 `7–9 ms`，因此校正后的 glass-to-glass 约为 `107 ms`。同一时段页面为：

```text
capture estimate          23 ms
encode                    9.1 ms
jitter buffer             1.4 ms
decode                    1.8 ms
measured subtotal         45 ms
corrected glass-to-glass ~107 ms
unmeasured                ~62 ms
```

其中 `capture estimate` 在当前 MMF bound path 中只是
`1 / input_fps + VPSS CostTime`，`encode` 是 VENC `HwEncTime`。约 62 ms 差值主要
位于无法由普通 HDMI 输入反推的源端 GTK/Wayland 合成与 KMS 扫描相位，以及
LT6911/VI/VPSS/VENC 间未带源时间戳的硬件排队；它不是 Chromium jitter buffer，
也不能通过把该 62 ms 常量加回 UI 得到对所有信号源都准确的总延迟。准确的
glass-to-glass 验收仍以画面内嵌时钟或光电测试为准。

## 2026-09-07 99 时钟对照

107 仍为 1920×1080 H.264 60 FPS WebRTC。99 Plasma Wayland 全屏
`kvm-latency-clock`，HDMI-A-1 与 eDP-1 镜像 1080p60。浏览器
`drawImage(video)` 与 `Date.now()` 同拍冻结 8 帧，读取画面 Unix 毫秒：

```text
raw browser_now - clock_unix_ms
  102, 104, 105, 106, 107, 109, 111, 122 ms
  p50 106.5 ms  mean 108.3 ms
```

常驻 SSH 往返测量本机与 99 时钟偏差约 `-2 ms`（99 略慢），校正后
glass-to-glass 约 `104–110 ms`。同期页面：

```text
capture estimate          23 ms
encode                    9.1 ms
ICE RTT                   1.0–4.0 ms
jitter buffer             0.6–0.9 ms
decode                    1.5–1.9 ms
measured pipeline         38–47 ms
corrected glass-to-glass ~105 ms
unmeasured                ~60–67 ms
```

与 2026-09-04 的 62 ms 未测段一致。页面文案已从“总测延迟”改为“管线已测”，
并在合计上提供 tooltip，避免与画面内嵌时钟直接相减。

活流 `/proc/cvitek`（Depth=1、LostCnt=0、VENC LeftFrm=0）：

```text
VPSS CostTime / HwCostTime    6.3 / 5.6 ms
VENC HwEncTime                9.1 ms
UI capture                    40 ms = 2 × 1/60 s + CostTime
  HDMI IN → 编码器前：当前帧 + VPSS waitq（不含 VENC waitq / u32Depth）
```

jitter/decode 已含在 present 里，且未重复加总。采集按 VI 公共池和 VPSS
Depth 计入排队场次，不再只加一场周期。源端 GTK/Wayland 合成相位仍无 PTS，
不写进采集。

| 段 | 大约 | 页面是否计入 |
| --- | ---: | --- |
| 99 GTK/Wayland 合成 + KMS 扫描相位 | 8–17 ms | 否，无 HDMI 源 PTS |
| LT6911 + CSI + VI 缓冲（约 1–2 场） | 17–33 ms | 否；活 1080 禁止读 `/proc/cvitek/vi` |
| VPSS 排队（Depth=1 仍可能等一场） | 0–17 ms | 否，只计 CostTime |
| 计入的一场输入 + VPSS CostTime | 23 ms | 采集估算 |
| VENC HwEncTime | 9.1 ms | 编码 |
| GetStream / Core / SRTP / UDP | 数 ms | 否 |
| 网络单向（ICE RTT/2） | 0.5–2 ms | 否，RTT 只作诊断 |
| 完整帧 receive→display | 8–12 ms | present（含 jitter+decode） |

2026-08-04 分段实测同一量级：目标变化到裸 NV21 平均 59.7 ms（46/63 ms
双峰，差一场 60 Hz），H.264 编码约 12 ms，HTTP 触发到 WebRTC 画面约
90 ms。UI 采集 23 ms 只覆盖了 NV21 路径里的一场周期 + VPSS 作业，剩下
约两场硬件排队无法从普通 HDMI 输入反推。不能把 60 ms 当常量加回 UI。

## 回归检查

```sh
pnpm test:adaptive-jitter-buffer
pnpm test:webrtc-playback-stats
pnpm test:video-stream-chart
pnpm check
pnpm build
```

真机检查至少包含：标准/旧接口最终值、零丢包稳定回落、注入丢包后的快速上调、
性能浮窗开关前后的 FPS，以及最后一个客户端关闭后的 pipeline 回收。
