import assert from 'node:assert/strict'
import { captureConsoleFrame, registerConsoleFrameProvider, encodeConsoleFrame, captureConsoleSelectionFrame } from '../src/lib/console-frame.ts'

await assert.rejects(captureConsoleFrame, /CONSOLE_FRAME_UNAVAILABLE/)
const frame = { blob: new Blob(['png']), width: 1920, height: 1080 }
const old = registerConsoleFrameProvider(async () => frame)
const remove = registerConsoleFrameProvider(async () => frame)
old()
assert.equal(await captureConsoleFrame(), frame, 'old unmount must preserve a newer console')
remove()
await assert.rejects(captureConsoleFrame, /CONSOLE_FRAME_UNAVAILABLE/)
let resolve!: (value: typeof frame) => void
const unregister = registerConsoleFrameProvider(() => new Promise(r => { resolve = r }))
const pending = captureConsoleFrame()
unregister()
resolve(frame)
await assert.rejects(pending, /CONSOLE_FRAME_UNAVAILABLE/, 'do not expose frames from a removed console')

class Video { videoWidth = 1920; videoHeight = 1080; readyState = 1 }
Object.assign(globalThis, { HTMLVideoElement: Video })
await assert.rejects(encodeConsoleFrame(new Video() as unknown as HTMLVideoElement), /CONSOLE_FRAME_UNAVAILABLE/)
console.log('console frame lifetime and no-frame handling: passed')

const target = { isConnected: true } as HTMLElement
const otherTarget = { isConnected: true } as HTMLElement
let currentTarget = target
const clearSelection = registerConsoleFrameProvider(async () => frame, () => currentTarget)
assert.deepEqual(await captureConsoleSelectionFrame(), { frame, target })
currentTarget = otherTarget
assert.equal((await captureConsoleSelectionFrame()).target, otherTarget)
// Detached targets must never receive a selection overlay.
Object.defineProperty(otherTarget, 'isConnected', { value: false })
await assert.rejects(captureConsoleSelectionFrame, /CONSOLE_FRAME_UNAVAILABLE/)
clearSelection()
const release = registerConsoleFrameProvider(() => new Promise(r => { resolve = r }), () => target)
const selecting = captureConsoleSelectionFrame()
release()
resolve(frame)
await assert.rejects(selecting, /CONSOLE_FRAME_UNAVAILABLE/)
console.log('console selection target ownership and lifetime: passed')
