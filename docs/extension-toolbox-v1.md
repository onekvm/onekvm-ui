# Extension Toolbox API v1

Requires `onekvm-extension-host >= 0.1.0-r32`, `onekvm-ui >= 0.1.0-r56`
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
      "i18n": { "zh": { "title": "HID 宏" } },
      "icon": { "source": "lucide", "name": "keyboard" },
      "order": 10,
      "presentation": "window",
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
| `i18n` | At most 32 locale entries containing only `title`; locale is 1–35 ASCII letters/digits/underscore/hyphen |
| `icon` | Optional Lucide `{source,name}` or custom `{source,path}`; custom SVG/PNG/WebP under `web/` |
| `order` | Signed 32 bit integer, default 0; ties sort by full tool ID |
| `presentation` | Required `drawer` or `window` |
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
  readonly showConsoleWhileRecording: () => () => void
  readonly close: () => Promise<boolean>
  readonly saveSettings: () => Promise<boolean>
  readonly registerSettings: (adapter: ExtensionPageSettingsAdapterV1) => () => void
}
```

`subscribeHIDReports` is reserved for the `hid-macro` tool. It observes
keyboard and mouse reports sent from this browser to the controlled device,
with a monotonic timestamp. The tool must unsubscribe when recording stops or
unmounts. It does not expose incoming reports or reports from other clients.
`showConsoleWhileRecording` is also reserved for `hid-macro`: on a narrow
viewport it hides the full-screen tool without unmounting it, lets manual input
reach the console and shows a return control to stop recording. Its returned
function restores the tool if it is still hidden.

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
Focus in a local tool/menu/pin releases remote input and pointer lock. Clicking
uncovered video resumes control unless a device macro owns HID.

Pinned launchers occupy a separate section of the existing console toolbar.
They follow its position and visibility. Closing a tool retains its pin;
unpinning leaves the window open. The toolbox menu shows pinned tools first,
with pointer and touch drag handles plus arrow key ordering. Unpinned tools
appear below; pin controls use text buttons. The toolbar retains its overflow
menu, without a separate pin management menu. Preferences remain isolated by origin and
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
