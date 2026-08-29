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
