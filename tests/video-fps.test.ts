import assert from 'node:assert/strict'

import {
  fpsFromFrameDelta,
  playbackFrameCount,
  videoFrameCallbackStalled,
} from '../src/lib/video-fps.ts'

assert.equal(fpsFromFrameDelta(120, 60, 1000), 60)
assert.equal(fpsFromFrameDelta(60, 60, 1000), 0)
assert.equal(fpsFromFrameDelta(90, 60, 0), 0)

assert.equal(playbackFrameCount(null, 12), 12)
assert.equal(playbackFrameCount({ getVideoPlaybackQuality: () => ({ totalVideoFrames: 80 }) }, 12), 80)
assert.equal(playbackFrameCount({ getVideoPlaybackQuality: () => ({ totalVideoFrames: 3 }) }, 12), 12)

assert.equal(videoFrameCallbackStalled(0, 2000), true)
assert.equal(videoFrameCallbackStalled(100, 2000), true)
assert.equal(videoFrameCallbackStalled(1000, 1500), false)

console.log('video-fps tests passed')

// Exercise source replacement and coalesced rVFC callbacks through Vue hooks.
const { createRenderer, shallowRef } = await import('vue')
const { createServer } = await import('vite')
const { fileURLToPath } = await import('node:url')
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, server: { middlewareMode: true, hmr: false, watch: null } })
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {}, patchProp: () => {},
  parentNode: () => null, nextSibling: () => null,
})
let now = 0
let sample: (() => void) | undefined
const globals = { window: { setInterval: (callback: () => void) => { sample = callback; return 1 }, clearInterval: () => { sample = undefined } }, performance: { now: () => now } }
const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
let app: ReturnType<typeof renderer.createApp> | undefined
try {
  const { useVideoFps } = await server.ssrLoadModule('/src/composables/useVideoFps.ts')
  class Video extends EventTarget {
    total = 0
    callback: any
    getVideoPlaybackQuality: (() => { totalVideoFrames: number }) | undefined = () => ({ totalVideoFrames: this.total })
    requestVideoFrameCallback(callback: any) { this.callback = callback; return 1 }
    cancelVideoFrameCallback() { this.callback = undefined }
    present(frames: number) { this.callback(now, { presentedFrames: frames, expectedDisplayTime: now }) }
  }
  const element = new Video()
  const fps: number[] = []
  app = renderer.createApp({ setup() { useVideoFps(shallowRef(element), (value: number) => fps.push(value)); return () => null } })
  app.mount({})
  for (let frame = 1; frame <= 240; frame++) { now = frame * 1000 / 60; element.total = frame; element.present(frame) }
  sample!()
  assert.equal(fps.at(-1), 60)
  element.total = 0
  element.dispatchEvent(new Event('emptied'))
  now += 1000
  element.total = 60
  element.present(60)
  sample!()
  assert.equal(fps.at(-1), 60, 'Protocol switching must not compare a new source’s counter against old callbacks')
  element.getVideoPlaybackQuality = undefined
  element.dispatchEvent(new Event('emptied'))
  now += 1000
  element.present(60)
  sample!()
  assert.equal(fps.at(-1), 60, 'One coalesced rVFC callback can represent 60 presented frames')
  app.unmount()
  app = undefined
  assert.equal(sample, undefined)
} finally {
  app?.unmount()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  await server.close()
}
console.log('video-fps source lifecycle tests passed')
