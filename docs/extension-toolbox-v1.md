# Extension Toolbox API v1

Requires `onekvm-extension-host >= 0.1.0-r35`, `onekvm-ui >= 0.1.0-r67`
and `onekvm-core >= 0.1.0-r113`. The trusted Vue runtime is shared with
extension pages; bundle your component as an IIFE with Vue and Naive UI external.

## Manifest

`toolbox` is optional and independent of `page`, `toolbar` and `shell`.
Catalog summaries and details expose the same metadata. Listing a toolbox never
executes its scripts or starts its services. Only installed, enabled extensions
with an active version appear in the console.

```json
{
  "toolbox": {
    "items": [{
      "id": "scripts",
      "title": "HID Macros",
      "subtitle": "Record and run device input",
      "i18n": { "zh": { "title": "HID 宏", "subtitle": "录制并运行设备输入" } },
      "icon": { "source": "lucide", "name": "keyboard" },
      "order": 10,
      "presentation": "window",
      "layout": "edge-to-edge",
      "size": { "width": 560, "height": 440 },
      "view": { "renderer": "vue", "entrypoint": "web/scripts.js" }
    }]
  }
}
```

Unknown fields are rejected. Limits are identical in Rust, OE packaging and the
example validator:

| Field | Contract |
| --- | --- |
| `items` | At most 16 entries |
| `id` | Unique within the extension; 2–63 lowercase ASCII letters/digits/hyphens, starts with letter/digit |
| `title` | Nonblank, at most 120 Unicode characters, no control characters |
| `subtitle` | Optional second-line text; nonblank when present, at most 160 Unicode characters, no control characters |
| `i18n` | At most 32 locale entries containing `title` and, when `subtitle` is set, a localized `subtitle`; locale is 1–35 ASCII letters/digits/underscore/hyphen |
| `icon` | Optional Lucide `{source,name}` or custom `{source,path}`; custom SVG/PNG/WebP under `web/` |
| `order` | Signed 32 bit integer, default 0; ties sort by full tool ID |
| `presentation` | Required `drawer` or `window` |
| `layout` | Optional `padded` (default) or `edge-to-edge`; the latter removes host content padding and scrolling |
| `size` | Optional width/height, each 1–4096 CSS px; host clamps to viewport |
| `view` | Required renderer `vue` and normalized `web/*.js` entrypoint |

Declared resources must be regular packaged files, without symlink traversal.
Absolute paths, backslashes, empty path segments, `.` and `..` are forbidden.
Raise the extension version whenever UI assets change. The full tool ID is
`extension-id/local-id` and stays stable across versions.

## Registration

Register synchronously while the matching entrypoint executes:

```js
const { vue, toolbox } = window.OneKVMPluginUI.v1
const { defineComponent, h } = vue
toolbox.register('my-extension', 'inspect', {
  apiVersion: 1,
  component: defineComponent({
    props: ['host'],
    setup({ host }) {
      return () => h('p', host.toolId)
    },
  }),
  styles: ['.my-inspector { padding: 12px; }'],
})
```

Registration is bound to `document.currentScript`, the extension/version/tool
and requested resource. Wrong IDs, duplicate registrations and asynchronous
registrations fail. Page and toolbox registration namespaces are separate.
Definitions cache by extension/version/tool/entrypoint. Concurrent requests
share a promise, queued scripts load serially, and loads time out after 15s.
Errors provide a retry. Stale results cannot mount after close or invalidation.

Styles are reference counted. Closing unmounts the instance; reopening reuses
the definition and reattaches styles. Retired versions release resources after
their last consumer leaves. Components must clean up subscriptions, timers,
sockets and observers in their Vue unmount hooks.

## Host prop

```ts
interface ExtensionToolHostV1 {
  readonly apiVersion: 1
  readonly toolId: string
  readonly extension: Readonly<ComputedRef<ExtensionStatus>>
  readonly presentation: Readonly<ComputedRef<'drawer' | 'window' | 'fullscreen'>>
  readonly getStatus: () => Promise<OneKVMStatus>
  readonly assetURL: (path: string) => string
  readonly invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>
  readonly subscribeHIDReports: (listener: (report: Uint8Array, timestamp: number) => void) => () => void
  readonly subscribeKeyboardText: (listener: (text: string, timestamp: number) => void) => () => void
  readonly showConsoleWhileRecording: () => () => void
  readonly showRecordingStatus: (activity: HIDRecordingActivity) => () => void
  readonly overlayTarget: Readonly<Ref<string | HTMLElement>>
  readonly registerChildWindow: (child: ToolChildWindow) => ChildWindowRegistration
  readonly setWindowState: (state: 'normal' | 'maximized' | 'minimized') => void
  readonly resizeWindow: (size: { width: number; height: number }) => void
  readonly close: () => Promise<boolean>
  readonly saveSettings: () => Promise<boolean>
  readonly registerSettings: (adapter: ExtensionPageSettingsAdapterV1) => () => void
}
```

`subscribeHIDReports` is reserved for the `hid-macro` tool. It observes
keyboard and mouse reports sent from this browser to the controlled device,
with a monotonic timestamp. The tool must unsubscribe when recording stops or
unmounts. It does not expose incoming reports or reports from other clients.
`showRecordingStatus` is reserved for `hid-macro`. Pass
`{ stats: Ref<{ receivedReports, writtenActions }>, stop: () => void }` to hide
the tool without unmounting it and show the same global banner used for playback.
This releases manual console input on desktop and mobile. The returned cleanup
removes that activity and restores the tool; call it when capture stops or the
component unmounts. A second simultaneous recording is rejected. The older
`showConsoleWhileRecording` API retains its narrow-screen return control for
compatibility. Recording is browser-local; playback timing is device-owned.

`invoke` and `assetURL` are scoped to the extension. Settings adapters follow
[Vue Page API v1](extension-vue-page-v1.md). The host validates/saves settings
and asks Save/Discard/Cancel before ordinary close or drawer switching.
Invalidation from disable, removal, upgrade or lost permissions overrides drafts.

This is the trusted main UI execution model. Core checks `settings.view` for
catalog/resources and `settings.manage` for mutation/invoke; the extension host
also checks active version, declared methods and disable policy. Scoped methods
are an interface contract, not a JavaScript security sandbox.

## Console behavior

One instance per full ID. Windows coexist and may be dragged/resized; only one
drawer is open. Narrow viewports show the active tool fullscreen while retaining
the same Vue instance. All surfaces follow the browser fullscreen mount target.
Tools with `layout: edge-to-edge` own the complete content rectangle below the
title bar; they must provide any internal spacing and clip their own overflow.
Focus in a local tool/menu/pin releases remote input and pointer lock. Clicking
uncovered video resumes control unless a device macro owns HID.

Window title bars use the tool's manifest icon, falling back to the extension
icon and then the generic tool icon. Shared owned windows inherit the same icon.

Windows share normal, maximized and minimized states. Maximization retains normal
placement; restoring, including after minimization, retains the previous state.
Double-clicking the title toggles maximization; dragging a maximized title restores
it under the pointer. All eight edges/corners resize within the visual viewport
and safe area. Alt+Space opens the system menu; Alt+F4 closes. Its Move and Size
commands accept arrows (16 px, Shift for 1 px), Enter to commit and Escape to
cancel. Focused titles and the bottom-right resize handle also accept arrows.
Menus are mounted in the fullscreen-aware overlay, outside the clipped window.

## Owned windows

Use the shared `toolbox.Window` component instead of implementing window chrome:

```js
const { vue: { h, ref }, toolbox } = window.OneKVMPluginUI.v1
const editing = ref(false)
// Inside the registered tool component's render function:
h(toolbox.Window, {
  host, open: editing.value, title: 'Edit script', width: 440, height: 430,
  modal: true, resizable: true, maximizable: true,
  beforeClose: async () => true,
  onClose: () => { editing.value = false },
}, { default: () => h('textarea') })
```

`host`, `open` and `title` are required; `modal`, `resizable` and `maximizable`
default to true. Owned windows do not minimize independently. Nesting a Window
inside another Window assigns that immediate owner automatically. Owned windows
stay above their owner and hide with a minimized owner. A modal window disables
its immediate owner; attempts to activate that owner focus the deepest blocking
dialog and flash its title bar. Other tools remain usable. Set `modal: false` for
a modeless owned window whose owner remains interactive.

Ordinary close awaits `beforeClose`, if supplied; false vetoes close. Descendants
close before their owner, and each leave transition finishes before the owner is
removed. Focus returns to the opener when it is still available. Forced extension
invalidation bypasses close vetoes. Always handle `close` by setting `open` false.

A component ref exposes `focus(attention?)`, `close(force?)`, a readonly `state`,
`setState('normal' | 'maximized')`, `getBounds()` and `setBounds({ x?, y?, width?,
height? })`. Bounds use CSS pixels in the visual viewport's client coordinates;
`getBounds` returns null when hidden. Setting bounds restores a maximized window
and clamps its normal placement. State/bounds commands return false when blocked
by a modal child or unavailable for that window. Closing returns a promise that
resolves to true after its leave transition, or false after a close veto.

Custom wrappers may use `host.registerChildWindow({ owner?, modal?, focus, close })`.
It returns reactive `layer`, `active`, `blocked`, `visible` refs and `activate`,
`attention`, `closeChildren(force?)`, `dispose` callbacks. `focus(attention)` must
focus the window and optionally indicate attention; `close(force?)` returns a
promise that resolves after removal (false vetoes). Call `dispose` exactly when
the window leaves or unmounts; disposal is idempotent. Prefer the shared component
so ownership, focus, transitions and teardown stay consistent.

Pinned launchers occupy a separate section of the existing console toolbar.
They follow its position and visibility. Closing a tool retains its pin;
unpinning leaves the window open. The toolbox menu shows pinned tools first,
with pointer and touch drag handles plus arrow key ordering. Unpinned tools
appear below; pin controls use text buttons. Desktop pins use the available
toolbar width or rail height; overflow reserves one button only when needed.
The mobile menu lists all pins in its scrollable content. The toolbar retains
its overflow menu, without a separate pin management menu. Preferences remain isolated by origin and
user, and legacy edge-based records migrate to toolbar order. Schema 2 stores
only tool IDs and order. Unavailable storage preserves usable in-memory pins.
Disabled extensions retain preferences; an authoritative catalog confirming
removal cleans them up. Catalog request failures retain existing preferences.

Toolbox menus use Naive UI Dropdown. Performance and tool windows share
`ConsoleFloatingWindow`, including the Naive UI Card, title bar, controls,
rounded clipping and the existing Win11 enter/leave transitions (250ms in,
167ms out). Drawers slide from the right. Tool styles stay mounted until
the leave transition has finished. Reduced motion removes the visual motion.

See `onekvm-extension-example/examples/toolbox` for two tools in one extension,
including a dirty settings adapter, an instance-local counter and Pin steps.
