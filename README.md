# OneKVM UI

English | [简体中文](README.zh-CN.md)

The Vue 3 web interface for OneKVM. It combines the low-latency remote console,
device administration, extension management, and first-run setup in one
responsive application.

## Highlights

- Low-latency remote console with WebRTC audio/video, MJPEG video, and
  H.264/H.265 WebSocket video transports.
- Keyboard, mouse, gamepad, and text input control with pointer modes,
  keyboard layouts, shortcuts, and keyboard-lock support.
- Virtual media with ISO upload/download, writable virtual drives, and file
  management.
- First-run setup and device administration for accounts, networking, display,
  services, security, users, diagnostics, updates, and recovery.
- Extension discovery, installation, configuration, lifecycle management, and
  HTML, layout, and trusted Vue extension pages.
- Responsive, permission-aware UI with light/dark themes, English, Simplified
  Chinese, and Traditional Chinese catalogs, plus product integration hooks.
- A standalone Recovery UI for firmware installation, user reset, factory reset,
  and reboot.

## Runtime architecture

The browser consumes the OneKVM Core HTTP API and status event stream. Video
uses WebRTC, with MJPEG and WebSocket transports available when needed; HID
reports use the transport selected for the active video mode.

Production builds are designed to be served by OneKVM Core on the same origin.
The advanced settings page uses hash routes such as
`#/settings/advanced/system`, so a static server does not need history-mode
fallback rules.

## Requirements

- Node.js 22.6 or newer
- pnpm 9 or newer
- A compatible OneKVM Core instance for API-backed features

## Development

Install dependencies and start Vite:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The browser always sends API, event-stream, WebSocket, and WebRTC signaling
requests to the Vite origin. To develop against another device, create
`.env.development.local` and let Vite proxy those requests to OneKVM Core:

```dotenv
ONEKVM_DEV_PROXY_TARGET=http://192.0.2.10
VITE_WITH_CREDENTIALS=true
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ONEKVM_DEV_PROXY_TARGET` | Empty | OneKVM Core origin used by the Vite development proxy |
| `VITE_WITH_CREDENTIALS` | `true` | Include authentication cookies in browser requests |

Vite proxies `/api` and `/plugins`, including SSE responses and WebSocket
upgrades. The browser therefore stays on one origin and does not require Core
CORS changes. `secure: false` allows development against devices using a
self-signed HTTPS certificate; it does not change production TLS validation.

To open the development UI from another computer on the LAN, run
`pnpm dev --host 0.0.0.0`. Do this only on a trusted network.

## Commands

```sh
pnpm dev            # start the development server on port 3001
pnpm dev:recovery   # start the Recovery UI on port 3002
pnpm check          # run Vue and TypeScript type checking
pnpm build          # type-check and emit the console and Recovery production bundles
pnpm build:recovery # emit only the Recovery production bundle
pnpm preview        # serve dist/ locally for inspection
pnpm test:recovery  # Recovery API and locale tests
```

Focused regression tests are also available as `pnpm test:*` scripts; run the
tests related to the code you change.

Production assets are written to `dist/`. Recovery is a second Vite build that
inlines JS and CSS into `dist-recovery/index.html` for the initramfs web
server. That page exposes firmware flash (`.fwup` updates or a complete
`.img`), reset of the default Web user, factory reset, and reboot. Appearance
follows the system, or can be locked to light or dark.

## Project layout

```text
src/
├── api/          Typed OneKVM Core client and API models
├── components/   Console, setup, settings, and management views
├── composables/  Authentication, transport, video, keyboard, and mouse state
├── extensions/   Trusted extension Vue-page host runtime
├── i18n/         Locale discovery, lazy catalogs, and translation runtime
├── input/        HID keyboard mapping and text conversion
├── lib/          Transport, network, video, shortcut, and utility modules
├── product/      Optional product integration boundary
└── recovery/     Standalone Recovery UI (firmware, reset user, factory reset, reboot)
```

`App.vue` installs the shared Naive UI providers. `AuthGate.vue` owns initial
setup and sign-in. `AppShell.vue` switches between the remote console and the
advanced settings workspace.

## Extensions

OneKVM extensions may expose:

- sandboxed HTML pages;
- host-rendered layout pages backed by their settings schema; or
- trusted Vue pages that reuse the host Vue and Naive UI runtimes.

See [Extension Vue Page API v1](docs/extension-vue-page-v1.md) for the trusted
Vue contract. Extension pages must remain scoped to their own assets, settings,
routes, and declared controller methods.

## Product builds

The base product implementation in `src/product/` does not add branding or
extra settings. A product build may replace that directory while composing a
temporary source tree to provide:

- a badge derived from the authenticated device;
- additional user-assignment metadata; and
- permission-controlled settings sections.

Keep product-only behavior behind this interface so the base UI remains
independently buildable.

## Internationalization

English is bundled as the fallback catalog. Chinese catalogs are loaded on
demand. Add application strings to all three locale files and use the `t()`
runtime rather than embedding user-facing text in shared components. Extension
translations stay inside each extension instead of being added to this UI.

## Verification

Before handing off a change, run:

```sh
pnpm check
pnpm build
git diff --check
```

Run the relevant `pnpm test:*` scripts for behavioral changes.

For transport, network, update, or recovery changes, also exercise the feature
against a device because browser-only type checks cannot validate Core protocol
compatibility or reconnect behavior.

## License

This project is licensed under the GNU General Public License v3.0. See
[LICENSE](LICENSE) for the complete terms.
