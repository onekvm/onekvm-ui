# Extension Web Components API v1

Extension settings pages and toolbox views accept native custom elements,
including Lit elements. They use the existing authenticated asset routes,
settings actions, tool windows, mobile presentation, and extension-scoped methods.
The host does not require a Vue dependency in the extension bundle.

For initialization on console entry without opening a page or tool, use the
[console load hook](extension-console-v1.md).

## Manifest and registration

Use `renderer: "web-component"` for `page` or a toolbox item's `view`:

```json
{
  "page": {"title": "Example", "renderer": "web-component", "entrypoint": "web/page.js"},
  "toolbox": {"items": [{
    "id": "inspect", "title": "Inspect", "presentation": "window",
    "view": {"renderer": "web-component", "entrypoint": "web/tool.js"}
  }]}
```

Each entrypoint is a bundled classic JavaScript script under `web/`. Register
synchronously during its execution, using the matching extension and tool IDs:

```js
const runtime = window.OneKVMPluginUI.v1
class ExamplePage extends HTMLElement {
  connectedCallback() {
    this.textContent = this.host.extension.name
  }
}
runtime.register('example', {apiVersion: 1, element: ExamplePage})
// In the separate tool entrypoint:
// runtime.toolbox.register('example', 'inspect', {apiVersion: 1, element: ExampleTool})
```

Pass a constructor extending `HTMLElement`. Do not pass an instance, tag name,
Vue component, or source file. The host registers a unique custom-element
subclass, so the same constructor can serve several views, including constructors
already registered by a library. Reopening reuses the loaded definition while
creating a fresh instance. Upgrades load a separate definition for the new
extension version. Bump the version when packaged assets change.

Vue pages and tools retain their existing `component` registration contract.
HTML and layout pages also retain their current rendering paths.

## Host property

The host assigns the element's `host` **DOM property before connection**. It is
not an HTML attribute and does not require `customElements.whenDefined()`.
The read-only object exposes ordinary JavaScript snapshots and functions:

| Member | Contract |
| --- | --- |
| `apiVersion` | `1` |
| `extension` | Current extension status/settings object; no Vue ref |
| `language` | Current language code, including `zh` and `zh_tw` |
| `theme` | Current theme summary, when available |
| `presentation` | `page`, `drawer`, `window`, or `fullscreen` |
| `toolId` | Full tool ID for toolbox views |
| `getStatus()` | Read the device status |
| `assetURL(path)` | Versioned asset URL scoped to this extension |
| `invoke(method, payload?)` | Invoke a declared public method of this extension |
| `saveSettings()` | Save through the common settings host |
| `registerSettings(adapter)` | Register the native settings adapter below |
| `close()`, `resizeWindow(size)`, `setWindowState(state)`, `captureFrame()` | Toolbox views only; same contracts as the toolbox API |

Read current getters when needed. The element receives an
`onekvm-host-change` event when extension state, language, theme, or presentation
changes. Listen on the element itself. Lit views can call `requestUpdate()` in
that listener; native views can update their own DOM.

```js
connectedCallback() {
  this.changed = () => this.requestUpdate()
  this.addEventListener('onekvm-host-change', this.changed)
}
disconnectedCallback() {
  this.removeEventListener('onekvm-host-change', this.changed)
}
```

The existing backend permissions and declared-method checks apply. Commands on
a detached view's host are rejected. The trusted main-page execution model is
the same as Vue extensions; Shadow DOM provides style encapsulation.

## Settings

The native adapter uses booleans instead of Vue refs:

```js
this.settings = this.host.registerSettings({
  dirty: false,
  valid: true,
  collect: () => ({message: this.message}),
  reset: settings => {
    this.message = settings.message
    this.settings.update({dirty: false, valid: true})
  },
})
// After local input:
this.settings.update({dirty: true, valid: this.message.length <= 120})
// In disconnectedCallback:
this.settings.dispose()
```

The registration exposes `update({dirty?, valid?})` and idempotent `dispose()`.
Optional `showHostActions: false` hides the common settings-page action row.
Save, Reload, schema validation and toolbox Save/Discard/Cancel behavior use
the existing host. The wrapper also disposes registrations during unmount.

## Lit, styling and cleanup

Bundle Lit and extension dependencies into the entrypoint IIFE; do not load a
framework from a CDN at runtime. The main UI does not supply a Lit singleton.
A Lit class declares `host` as a property with attributes disabled:

```js
import {LitElement, html, css} from 'lit'
class Inspector extends LitElement {
  static properties = {host: {attribute: false}}
  static styles = css`:host { display:block; color:var(--foreground); }`
  render() { return html`<p>${this.host?.extension.name}</p>` }
}
window.OneKVMPluginUI.v1.toolbox.register('example', 'inspect', {
  apiVersion: 1, element: Inspector,
})
```

Theme CSS custom properties inherit into Shadow DOM. Use those tokens inside
the component's own styles. Global Naive UI selectors do not cross a shadow
boundary. Optional registration `styles: string[]` remains available for light-DOM
styles and follows the host's existing stylesheet lifecycle.

Call Lit's superclass lifecycle methods. Release timers, subscriptions, observers,
object URLs and requests in `disconnectedCallback`. Closing a tool or invalidating
it by disabling or upgrading its extension disconnects the instance; navigating
away from a settings page disconnects that page. A custom-element definition stays registered
for the lifetime of its browser document, as required by the platform.

The device acceptance fixture is in `onekvm-extension-host/tests/fixtures/web-component-probe`.
It provides a native settings page, a native tool and a bundled Lit tool. Generate
the ignored Lit bundle with `tests/build-web-component-probe.sh`, then build its
`onekvm-extension-web-component-probe` package through the distro Make entrypoint.
