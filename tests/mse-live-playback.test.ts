import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
})
let now = 0
let tick = () => {}
const originals = ['setInterval', 'clearInterval', 'performance'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)!] as const)
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: (callback: () => void) => { tick = callback; return 1 } })
Object.defineProperty(globalThis, 'clearInterval', { configurable: true, value: () => {} })
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } })
try {
  const { MseLivePlayback } = await server.ssrLoadModule('/src/lib/mse-live-playback.ts')
  let ranges = [[0, 10.08]], requests = 0
  const video = {
    currentTime: 10, playbackRate: 1, paused: false, seeking: false,
    buffered: { get length() { return ranges.length }, start: (i: number) => ranges[i]![0]!, end: (i: number) => ranges[i]![1]! },
  }
  const player = new MseLivePlayback(video, () => requests++)
  player.start()
  tick()
  assert.equal(video.playbackRate, 1, 'Normal live headroom does not accelerate playback')
  ranges = [[0, 10.16]]
  now = 100; tick()
  assert.equal(video.playbackRate, 1.1, 'Small backlog accelerates without a seek')
  assert.equal(video.currentTime, 10)
  ranges = [[0, 10.10]]
  now = 200; tick()
  assert.equal(video.playbackRate, 1.1, 'Hysteresis avoids toggling near the trigger')
  ranges = [[0, 10.08]]
  now = 300; tick()
  assert.equal(video.playbackRate, 1)
  player.stop()

  player.reset()
  video.currentTime = 2
  ranges = [[0, 5.1]]
  player.fed(4000, true) // keyframe at 0
  player.fed(1000, true) // keyframe at 4, already present when recovery begins
  now = 400; tick()
  assert.equal(requests, 1)
  assert.equal(video.currentTime, 2, 'An old keyframe cannot satisfy a new recovery request')
  now = 500; tick()
  assert.equal(requests, 1, 'Repeated updates cannot flood keyframe requests')
  player.fed(1000, true) // newly requested keyframe at 5
  ranges = [[0, 5.02]]
  now = 600; tick()
  assert.equal(video.currentTime, 2, 'A keyframe at the very edge needs appended headroom')
  ranges = [[0, 5.08]]
  now = 700; tick()
  assert.equal(video.currentTime, 5.001, 'Recovery seeks to the fresh random-access point')
  assert.equal(video.playbackRate, 1)
  assert.equal(requests, 1)

  player.reset()
  ranges = [[0, 5.08]]
  video.currentTime = 5
  now = 800; tick()
  now = 1900; tick()
  assert.equal(requests, 2, 'A stopped playhead can request recovery despite a short backlog')
  player.reset()
  video.currentTime = 2
  ranges = [[0, 1], [5, 5.08]]
  now = 2000; tick()
  assert.equal(requests, 3, 'A disjoint future range is not playable headroom')
  assert.equal(video.currentTime, 2)
  video.playbackRate = 1.1
  player.stop()
  assert.equal(video.playbackRate, 1, 'Stopping restores the media element for the next transport')
  console.log('MSE live playback: headroom, hysteresis, fresh-keyframe recovery, stall and cleanup passed')
} finally {
  for (const [name, descriptor] of originals) Object.defineProperty(globalThis, name, descriptor)
  await server.close()
}
