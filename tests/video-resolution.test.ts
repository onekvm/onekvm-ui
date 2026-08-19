import assert from 'node:assert/strict'

import {
  isVideoResolutionValue,
  supportedInputResolutions,
  videoResolutionOptions,
} from '../src/lib/video-resolution.ts'

assert.equal(supportedInputResolutions.length, 12)
assert.equal(supportedInputResolutions.some((mode) => mode.width === 854), false)
assert.ok(supportedInputResolutions.some((mode) => mode.width === 640 && mode.height === 480))
assert.ok(isVideoResolutionValue(0))
assert.ok(isVideoResolutionValue(1080))
assert.ok(isVideoResolutionValue(480))
assert.ok(isVideoResolutionValue(12801024))
assert.equal(isVideoResolutionValue(854), false)

const options = videoResolutionOptions('自动')
assert.equal(options[0]?.value, 0)
assert.equal(options[0]?.label, '自动')
assert.ok(options.some((option) => option.label === '640 x 480' && option.value === 480))
assert.ok(options.some((option) => option.label === '1280 x 1024' && option.value === 12801024))
assert.equal(options.some((option) => option.label.includes('854')), false)

console.log('video-resolution tests passed')
