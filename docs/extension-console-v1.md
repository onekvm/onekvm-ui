# Extension console load hook v1

An enabled extension may run an initialization function when an authenticated
user with `settings.view` enters the remote console. This is independent of
video connection and first-frame delivery. Opening a floating settings window
does not leave the console; navigating to the standalone settings page does.

## Declaration and registration

Declare a packaged classic JavaScript entrypoint:

```json
"console": {"entrypoint": "web/console.js"}
```

Register synchronously while that script executes. The extension ID must match
the manifest. Duplicate, delayed and cross-extension registration is rejected.
The entrypoint can bundle native JavaScript, Lit or another library; a Vue
dependency is not required.

```js
window.OneKVMPluginUI.v1.console.register('example', {
  apiVersion: 1,
  onLoad(host) {
    const element = document.createElement('my-console-widget')
    document.body.append(element)
    window.addEventListener('resize', () => element.refresh?.(), {
      signal: host.signal,
    })
    return () => element.remove()
  },
})
```

`onLoad` runs once per console entry and extension version. Catalog refreshes,
settings saves and media reconnects do not run it again. Loaded registrations
are cached by extension, version and entrypoint for the browser document; put
per-entry effects inside `onLoad`, rather than at script top level. Bump the
extension version when changing packaged resources.

## Host and cleanup

The frozen host uses ordinary getters and functions, without Vue refs:

| Member | Contract |
| --- | --- |
| `apiVersion` | `1` |
| `extension` | Latest console catalog entry for this extension |
| `language` | Current UI language |
| `signal` | Aborted when this invocation ends |
| `getStatus()` | Read the device status under the signed-in user's access |
| `assetURL(path)` | Versioned asset URL scoped to this extension |
| `invoke(method, payload?)` | Call a declared public method on this extension |

`onLoad` may return nothing, a synchronous cleanup function, or a Promise of
either. Leaving the console, losing access, signing out, disabling, uninstalling
or upgrading the extension aborts the signal and calls cleanup once. If async
initialization finishes after cancellation, its returned cleanup runs immediately.
Use the signal for event listeners and cancellable work, and check it after
awaits before adding DOM. Release timers, subscriptions and mounted components
in cleanup. Host methods reject new calls after cancellation.

Hooks load independently. A failing hook is logged and aborted without blocking
other extensions or the console. It can retry on the next console entry or after
disable/re-enable. Definition loading times out after 15 seconds. Remove pending
work cooperatively through the signal; the runtime cannot forcibly undo arbitrary
JavaScript side effects or terminate a non-cooperating callback.

## i18n

Keep extension strings in the extension bundle, using `default`, `zh` and
`zh-TW` catalogs. `default` is the English fallback; keep it identical to any
explicit English catalog. Use the shared translator on every render:

```js
const runtime = window.OneKVMPluginUI.v1
const translate = runtime.i18n.createTranslator({
  default: {ready: 'Ready'},
  zh: {ready: '已就绪'},
  'zh-TW': {ready: '已就緒'},
})
runtime.console.register('example', {
  apiVersion: 1,
  onLoad(host) {
    const node = document.createElement('span')
    const render = () => { node.textContent = translate('ready') }
    const observer = new MutationObserver(render)
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ['lang'],
    })
    document.body.append(node)
    render()
    return () => { observer.disconnect(); node.remove() }
  },
})
```

`host.language` and `runtime.language()` return current UI codes, including `zh`
and `zh_tw`; manifest/message catalogs use locale tags such as `zh-TW`. The shared
translator resolves these and falls back to `default`. It also substitutes
`{name}` with `translate('key', {name: value})`. `createMessages(catalogs)` offers
getter-based messages for Vue consumers; Lit/native consumers must rerender on
language changes, as above. Do not capture a translated string once at module
load or restart the entire console hook just to change language.

Core UI text, including this feature's risk disclosure, lives in the UI's three
locale files. Those compile into separate `onekvm-l10n-en`, `onekvm-l10n-zh` and
`onekvm-l10n-zh-tw` IPKs. When deploying UI text changes, install the matching
language IPKs along with `onekvm-ui`, then refresh the browser. Installing only
the main UI IPK leaves the device's previous translations in place.

## Risk disclosure

Declaring `console` automatically adds **Load script when the console starts · Risk** to the
plugin details' provided features, including before installation. It cannot be
hidden by omitting the backend `capabilities` array. The script executes in the
main console document and can read/change that page and call APIs as the
signed-in user. The scoped host helpers do not sandbox arbitrary browser code.
Only enable trusted plugins.

This declaration requires matching UI, Core console-catalog forwarding and
extension-host support. The test fixture in
`onekvm-extension-host/tests/fixtures/web-component-probe` records entries,
aborts and cleanups and removes its temporary overlay on exit.
