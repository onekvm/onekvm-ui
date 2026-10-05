# 浏览器视频编码能力

H.265 的接收能力按协议独立检测，不能把 WebRTC 和 WebSocket 的结果互用。
屏幕菜单和高级显示设置使用当前协议的检测结果；检测未结束或失败时禁用 H.265。
MJPEG 模式下按浏览器保存的编码视频协议判断后续选择。

- WebRTC：检查接收能力，再生成只接收的 SDP offer，确认包含 H265/HEVC。
- WebSocket：检查 JMuxer 实际使用的 `hvc1` MSE 类型，再通过同一 JMuxer
  播放路径解码内置的 H.265 Main / Level 5.0 样本。只有收到 `loadeddata`
  且存在视频尺寸才通过；报错、4 秒超时或资源请求失败均禁用。按 50ms 循环喂入
  样本，模拟持续的实时输入，让 `flushingTime=0` 的待追加片段完成写入。
- 探测结果仅在当前页面内缓存，界面和连接复用同一次探测。
- 明确选择 WebSocket 后，其 H.265 检测失败会提示切换到 H.264。
  WebRTC 的协商失败仍保留既有 WebSocket 回退。
- 实际 WebSocket 视频收到首帧后 5 秒仍未解码，或发生 MSE/媒体解码错误，
  结束该播放器和控制连接；H.265 显示 H.264 恢复入口。无输入信号时不启动此计时。

Edge 的 HEVC 支持与操作系统、解码组件、硬件和浏览器版本相关，不按浏览器名称
判断支持。小样本能验证解码路径可用，不能保证设备的所有分辨率、帧率或编码参数
均可播放；真实码流仍受运行时错误检测保护。WebRTC offer 探测也不等价于实流解码。

`src/assets/video/h265-main-l5.h265` 是 142 字节的自生成灰色样本，无音频、SEI
或设备画面，64×64、60 FPS、3 帧。可在主机上重新生成：

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i color=c=gray:s=64x64:r=60 -frames:v 3 -an \
  -c:v libx265 -profile:v main -pix_fmt yuv420p -preset ultrafast \
  -tune zerolatency \
  -x265-params 'level-idc=5:keyint=60:repeat-headers=1:aud=1:info=0:pools=none:frame-threads=1:log-level=error' \
  -f hevc src/assets/video/h265-main-l5.h265
```

生成后用 ffprobe 核对 Main / level=150 和 3 个可解码帧；修改 JMuxer 或探测路径
时运行 `pnpm test:websocket-video` 和 `pnpm test:video-transport`。
