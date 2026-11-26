import assert from 'node:assert/strict'
import { effectScope, shallowRef } from 'vue'
import { useVideoPlaybackState } from '../src/composables/useVideoPlaybackState.ts'

const timers = new Map<number, () => void>()
const delays = new Map<number, number>()
let next = 0
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
globalThis.setTimeout = ((callback: () => void, delay = 0) => { timers.set(++next, callback); delays.set(next, delay); return next }) as unknown as typeof setTimeout
globalThis.clearTimeout = ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout
const tick = () => { for (const [id, callback] of timers) { timers.delete(id); callback() } }
const scope = effectScope()
try {
  const video = shallowRef({ readyState: 1 } as HTMLVideoElement)
  const state = scope.run(() => useVideoPlaybackState(video))!
  assert.equal(state.hasFrame.value, false, 'Initial connection waits for the first picture')
  state.onPlaying()
  state.onWaiting()
  assert.equal(state.playing.value, true, 'A brief MSE underflow must not flash the connection indicator')
  assert.equal(state.hasFrame.value, true, 'The last picture remains visible')
  state.onPlaying()
  tick()
  assert.equal(state.playing.value, true, 'Playing cancels the pending stall')
  state.onWaiting()
  assert.ok(delays.get(next)! >= 2500, 'A stall shorter than a lost-signal report keeps the picture')
  tick()
  assert.equal(state.playing.value, false, 'A sustained stall still reports buffering')
  assert.equal(state.hasFrame.value, true, 'Buffering retains the last picture')
  state.onPlaying()
  state.onWaiting()
  state.reset()
  tick()
  assert.equal(state.hasFrame.value, false, 'A new media source does not display the previous connection’s frame')
  const signal = shallowRef<boolean | null>(true)
  const quiet = scope.run(() => useVideoPlaybackState(video, () => signal.value))!
  quiet.onPlaying()
  signal.value = false
  quiet.onWaiting()
  tick()
  assert.equal(quiet.playing.value, true, 'The no-signal still stays up while the source is rearmed')
  signal.value = true
  quiet.onWaiting()
  tick()
  assert.equal(quiet.playing.value, false, 'A stall with a signal reports buffering')
  signal.value = false
  assert.equal(quiet.playing.value, true, 'A no-signal report clears a buffering indicator over the still')
  quiet.reset()
  signal.value = true
  signal.value = false
  assert.equal(quiet.playing.value, false, 'A no-signal report does not invent the first picture')
  state.onPlaying()
  state.onWaiting()
  quiet.onPlaying()
  quiet.onWaiting()
  scope.stop()
  assert.equal(timers.size, 0, 'Unmount releases the stall timer')
} finally {
  scope.stop()
  globalThis.setTimeout = realSetTimeout
  globalThis.clearTimeout = realClearTimeout
}
console.log('video playback state tests passed')
