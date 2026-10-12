import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { computed, createRenderer, nextTick, shallowRef } from 'vue'
import { createServer } from 'vite'
import { KeyboardReportState } from '../src/lib/keyboard-report-state.ts'

const listeners = new Map<string, Set<() => void>>()
const emit = (event: string) => listeners.get(event)?.forEach(listener => listener())
const appended = new Set<FakeVideo>()
const tracks: { readyState: string; stop: () => void }[] = []
let failRequest = false
let playGate: Promise<void> | null = null
let requests = 0
let videoMounted = true

class FakeVideo {
  readyState = 4
  videoWidth = 1920
  videoHeight = 1080
  webkitPresentationMode = 'inline'
  webkitSupportsPresentationMode() { return true }
  webkitSetPresentationMode(mode: string) { this.webkitPresentationMode = mode; emit('webkitpresentationmodechanged') }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 } }
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
  activeElement: null as EventTarget | null,
  pointerLockElement: null as EventTarget | null,
  exitPointerLock() { this.pointerLockElement = null },
  querySelector: (selector: string) => selector === 'video#screen' ? (videoMounted ? video : null) : canvas,
  createElement: () => new FakeVideo(),
  body: { append: (element: FakeVideo) => appended.add(element) },
  async exitPictureInPicture() { this.pictureInPictureElement = null; emit('leavepictureinpicture') },
  addEventListener(event: string, listener: () => void) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(listener)
  },
  removeEventListener(event: string, listener: () => void) { listeners.get(event)?.delete(listener) },
}
class FakeSurface extends EventTarget {
  tagName = 'DIV'
  getAttribute() { return null }
  focus() { documentMock.activeElement = this }
  setPointerCapture() {}
  requestPointerLock() { documentMock.pointerLockElement = this }
}
const surface = new FakeSurface()
const keyboardReports: { keys: number[]; modifiers: number }[] = []
const mouseReports: { buttons: number }[] = []
const hidMock = {
  keyboardState: new KeyboardReportState((keys, modifiers) => keyboardReports.push({ keys, modifiers })),
  sendAbsoluteMouse: (buttons: number) => mouseReports.push({ buttons }),
  sendRelativeMouse: (buttons: number) => mouseReports.push({ buttons }),
}
const windowMock = Object.assign(new EventTarget(), { setTimeout, clearTimeout })
const globals = { document: documentMock, window: windowMock, __pipHID: hidMock, HTMLVideoElement: FakeVideo, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 }, HTMLCanvasElement: { prototype: { captureStream() {} } } }
const original = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  plugins: [{
    name: 'mock-pip-hid',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@/lib/onekvm' || id.replace(/\.ts$/, '') === fileURLToPath(new URL('../src/lib/onekvm', import.meta.url))) return '\0pip-hid'
    },
    load(id) { if (id === '\0pip-hid') return 'export const onekvm = globalThis.__pipHID' },
  }],
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
  const { useKeyboard } = await server.ssrLoadModule('/src/composables/useKeyboard.ts')
  const { useMouse } = await server.ssrLoadModule('/src/composables/useMouse.ts')
  const mode = shallowRef('webrtc')
  const otherBlocked = shallowRef(false)
  const dispatchKey = (type: string, code: string) => windowMock.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }))
  const dispatchPointer = (type: string) => surface.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 50, clientY: 50 }))
  let pip: ReturnType<typeof usePictureInPicture>
  const mount = () => {
    app = renderer.createApp({ setup() {
      pip = usePictureInPicture(() => mode.value)
      const blocked = computed(() => pip.active.value || otherBlocked.value)
      useKeyboard(blocked, shallowRef(surface), shallowRef(false))
      useMouse(shallowRef(video), shallowRef('absolute'), shallowRef(10), shallowRef(60), shallowRef('stretch'), shallowRef(surface), computed(() => !blocked.value))
      return () => null
    } })
    app.mount({})
  }
  mount()
  surface.focus()
  dispatchKey('keydown', 'KeyA')
  dispatchPointer('pointerdown')
  assert.deepEqual(keyboardReports.at(-1), { keys: [4], modifiers: 0 })
  assert.equal(mouseReports.at(-1)?.buttons, 1)
  surface.requestPointerLock()
  await pip!.toggle()
  await nextTick()
  assert.equal(documentMock.pictureInPictureElement, video)
  assert.equal(video.srcObject, stream, 'Native PiP must reuse the current stream')
  assert.equal(tracks.length, 0, 'Native PiP must not create a second captured stream')
  assert.equal(pip!.active.value, true)
  assert.deepEqual(keyboardReports.at(-1), { keys: [], modifiers: 0 }, 'Entering PiP must release held keys')
  assert.equal(mouseReports.at(-1)?.buttons, 0, 'Entering PiP must release held mouse buttons')
  assert.equal(documentMock.pointerLockElement, null, 'Entering PiP must release pointer lock')
  const pausedKeyboardCount = keyboardReports.length
  const pausedMouseCount = mouseReports.length
  dispatchKey('keydown', 'KeyB')
  dispatchPointer('pointerdown')
  surface.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: 1 }))
  assert.equal(keyboardReports.length, pausedKeyboardCount, 'PiP must not forward physical keyboard input')
  assert.equal(mouseReports.length, pausedMouseCount, 'PiP must not forward mouse buttons or scrolling')
  await pip!.toggle()
  await nextTick()
  assert.equal(pip!.active.value, false)
  dispatchKey('keydown', 'KeyB')
  dispatchPointer('pointerdown')
  assert.deepEqual(keyboardReports.at(-1), { keys: [5], modifiers: 0 }, 'Leaving PiP must restore keyboard input')
  assert.equal(mouseReports.at(-1)?.buttons, 1, 'Leaving PiP must restore mouse input')
  dispatchKey('keyup', 'KeyB')
  dispatchPointer('pointerup')

  await pip!.toggle()
  await nextTick()
  otherBlocked.value = true
  await documentMock.exitPictureInPicture()
  await nextTick()
  assert.equal(pip!.active.value, false, 'Closing the native PiP window must update input state')
  const stillBlockedCount = keyboardReports.length
  dispatchKey('keydown', 'KeyC')
  assert.equal(keyboardReports.length, stillBlockedCount, 'Leaving PiP must preserve other input blockers')
  otherBlocked.value = false
  await nextTick()

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

  documentMock.pictureInPictureEnabled = false
  videoMounted = false
  mount()
  assert.equal(pip!.supported.value, true, 'Opening the app in settings must not permanently disable Safari PiP')
  videoMounted = true
  await pip!.toggle()
  await nextTick()
  assert.equal(pip!.active.value, true, 'Safari PiP must suspend input too')
  video.webkitSetPresentationMode('inline')
  await nextTick()
  assert.equal(pip!.active.value, false, 'Safari native exit must restore input state')
  app!.unmount()
  documentMock.pictureInPictureEnabled = true

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
