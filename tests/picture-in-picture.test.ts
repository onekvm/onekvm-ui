import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRenderer, nextTick, shallowRef } from 'vue'
import { createServer } from 'vite'

const listeners = new Map<string, Set<() => void>>()
const emit = (event: string) => listeners.get(event)?.forEach(listener => listener())
const appended = new Set<FakeVideo>()
const tracks: { readyState: string; stop: () => void }[] = []
let failRequest = false
let playGate: Promise<void> | null = null
let requests = 0

class FakeVideo {
  readyState = 4
  videoWidth = 1920
  hidden = false
  muted = false
  playsInline = false
  srcObject: unknown = null
  async play() { await playGate }
  async requestPictureInPicture() {
    requests++
    if (failRequest) throw new Error('PiP denied')
    documentMock.pictureInPictureElement = this
    emit('enterpictureinpicture')
  }
  remove() { appended.delete(this) }
}
const video = new FakeVideo()
const stream = { id: 'existing-webrtc-stream' }
video.srcObject = stream
const canvas = {
  width: 1920, height: 1080,
  captureStream() {
    const track = { readyState: 'live', stop() { this.readyState = 'ended' } }
    tracks.push(track)
    return { getTracks: () => [track] }
  },
}
const documentMock = {
  pictureInPictureEnabled: true,
  pictureInPictureElement: null as FakeVideo | null,
  querySelector: (selector: string) => selector === 'video#screen' ? video : canvas,
  createElement: () => new FakeVideo(),
  body: { append: (element: FakeVideo) => appended.add(element) },
  async exitPictureInPicture() { this.pictureInPictureElement = null; emit('leavepictureinpicture') },
  addEventListener(event: string, listener: () => void) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(listener)
  },
  removeEventListener(event: string, listener: () => void) { listeners.get(event)?.delete(listener) },
}
const globals = { document: documentMock, HTMLVideoElement: FakeVideo, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 }, HTMLCanvasElement: { prototype: { captureStream() {} } } }
const original = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
})
const renderer = createRenderer({
  insert() {}, remove() {}, patchProp() {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
})
let app: ReturnType<typeof renderer.createApp> | undefined
try {
  const { usePictureInPicture } = await server.ssrLoadModule('/src/composables/usePictureInPicture.ts')
  const mode = shallowRef('webrtc')
  let pip: ReturnType<typeof usePictureInPicture>
  const mount = () => {
    app = renderer.createApp({ setup() { pip = usePictureInPicture(() => mode.value); return () => null } })
    app.mount({})
  }
  mount()
  await pip!.toggle()
  assert.equal(documentMock.pictureInPictureElement, video)
  assert.equal(video.srcObject, stream, 'Native PiP must reuse the current stream')
  assert.equal(tracks.length, 0, 'Native PiP must not create a second captured stream')
  assert.equal(pip!.active.value, true)
  await pip!.toggle()
  assert.equal(pip!.active.value, false)

  mode.value = 'mjpeg'
  await nextTick()
  await pip!.toggle()
  assert.notEqual(documentMock.pictureInPictureElement, video)
  assert.equal(appended.size, 1)
  assert.equal(tracks.at(-1)?.readyState, 'live')
  await pip!.toggle()
  assert.equal(tracks.at(-1)?.readyState, 'ended', 'Leaving canvas PiP must stop its capture')
  assert.equal(appended.size, 0)

  failRequest = true
  await assert.rejects(pip!.toggle(), /PiP denied/)
  assert.equal(tracks.at(-1)?.readyState, 'ended', 'A denied request must release its capture')
  assert.equal(appended.size, 0)
  failRequest = false

  await pip!.toggle()
  mode.value = 'webrtc'
  await nextTick()
  await nextTick()
  assert.equal(documentMock.pictureInPictureElement, null, 'Changing video mode must close the old PiP')
  assert.equal(tracks.at(-1)?.readyState, 'ended')
  app!.unmount()

  mode.value = 'mjpeg'
  mount()
  let finishPlay!: () => void
  playGate = new Promise<void>(resolve => { finishPlay = resolve })
  const before = requests
  const pending = pip!.toggle()
  app!.unmount()
  finishPlay()
  await pending
  assert.equal(requests, before, 'An unmounted view must not open PiP after playback becomes ready')
  assert.equal(documentMock.pictureInPictureElement, null)
  assert.equal(appended.size, 0)
  assert.ok(tracks.every(track => track.readyState === 'ended'))
  console.log('picture-in-picture tests passed')
} finally {
  app?.unmount()
  await server.close()
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
