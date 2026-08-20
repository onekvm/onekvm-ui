# Extension Vue Page API v1

Trusted OneKVM extensions can render a compiled Vue component inside the main
OneKVM UI instead of using an iframe. The component shares the host's Vue and
Naive UI instances, including theme, message, and dialog providers.

## Manifest

```json
{
  "page": {
    "title": "Example",
    "renderer": "vue",
    "entrypoint": "web/page.js"
  }
}
```

The entrypoint must be a compiled JavaScript file under `web/`. Source `.vue`
files are not accepted by extension package validation. Page assets use an
immutable versioned URL, so every changed entrypoint requires a new extension
version.

## Runtime sharing

Build the page as a single IIFE and leave `vue` and `naive-ui` external. Map
them to the runtime objects supplied by the host:

```ts
rollupOptions: {
  external: ['vue', 'naive-ui'],
  output: {
    globals: {
      vue: 'OneKVMPluginUI.v1.vue',
      'naive-ui': 'OneKVMPluginUI.v1.naive',
    },
  },
}
```

Register exactly one component when the entrypoint executes:

```ts
window.OneKVMPluginUI.v1.register('example', {
  apiVersion: 1,
  component: ExamplePage,
  styles: [pageStyles],
})
```

The host exposes a curated Naive UI surface rather than a second dependency
copy. A page must not bundle Vue or Naive UI because duplicated runtimes break
provider injection and increase memory use.

Interactive terminals must reuse the host xterm.js chunk the same way. Call
`window.OneKVMPluginUI.v1.xterm.load()` to obtain `{ Terminal, FitAddon }` and
the host-loaded xterm CSS. Do not add `@xterm/xterm` to an extension bundle.

```js
const { Terminal, FitAddon } = await runtime.xterm.load()
const terminal = new Terminal()
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.open(hostElement)
fitAddon.fit()
```

The curated Vue runtime also exposes the rendering helpers used by compiled
page components and built-ins such as `Teleport`. This allows a page to mount
host-rendered controls into placeholders inside canvas markup.

## Component host

The component receives a `host` prop with this contract:

```ts
interface ExtensionPageHostV1 {
  apiVersion: 1
  extension: Readonly<ComputedRef<ExtensionStatus>>
  getStatus(): Promise<OneKVMStatus>
  assetURL(path: string): string
  invoke<T = unknown>(method: string, payload?: unknown): Promise<T>
  registerSettings(adapter: ExtensionPageSettingsAdapterV1): () => void
}
```

`extension` and settings operations are scoped to the page's own extension.
The component cannot choose another extension ID.

`invoke` calls a public method declared by the extension manifest. The host
always supplies the current extension ID, so a page cannot invoke another
extension. Method availability and enabled-state policy are enforced by the
extension host.

## Settings adapter

Complex pages keep their draft state and serialization logic, then register it
with the common page host:

```ts
const unregister = host.registerSettings({
  dirty,
  valid,
  collect: () => ({ layout_json: JSON.stringify(layout.value) }),
  reset: (settings) => loadDraft(settings),
})
```

The common host owns Save and Reload buttons, schema validation, request
serialization, extension configuration calls, catalog refresh, loading state,
and Naive UI notifications. A page must not call `/api/extensions` directly.

Call the returned unregister function and release timers, observers, and event
listeners from the component's unmount lifecycle.
