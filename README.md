# OneKVM UI

English | [简体中文](README.zh-CN.md)

The Vue 3 web interface for OneKVM. It combines the low-latency remote console,
device administration, extension management, and first-run setup in one
responsive application.

## Highlights

- Remote video and audio over WebRTC, with MJPEG support and an optional
  H.264/H.265 WebSocket fallback when WebRTC cannot connect
- Keyboard and five-button mouse HID control, absolute and relative pointer
  modes, text input, keyboard layouts, and reusable shortcuts
- ATX power operations, fullscreen keyboard lock, and virtual media with ISO
  upload and writable virtual-drive file management
- First-run account, network, locale, timezone, and NTP setup
- Network, VLAN, WireGuard, DNS, static route, USB identity, video, service,
  user, session, log, resource, time, update, and recovery administration
- Runtime extension catalog, installation, configuration, lifecycle, health
  recovery, and HTML/layout/Vue extension pages
- Permission-aware navigation and product hooks for branded builds
- English, Simplified Chinese, and Traditional Chinese UI catalogs
- A separate Recovery UI build for firmware flash, default-user reset, and reboot

## Runtime architecture

The browser consumes the OneKVM Core HTTP API and status event stream. WebRTC
uses a `control` DataChannel for HID reports. MJPEG and the WebSocket video
fallback use a dedicated HID WebSocket. The fallback muxer, advanced settings,
and closed drawers are loaded on demand to keep the console startup path small.

Production builds are designed to be served by OneKVM Core on the same origin.
The advanced settings page uses hash routes such as
`#/settings/advanced/system`, so a static server does not need history-mode
fallback rules.

The `#/banned` route checks for HTTP 423 (Locked) from the public auth-status API.
The response uses no extra ban-state fields. It displays the notice signed “OneKVM Linux” only
while that connection is banned; other visitors return to the home page.
The page rechecks the state every five seconds and returns home after unblocking.
Its language switcher supports English and both Chinese locales.
Login failures and API 429 responses recheck the real state and immediately open
the notice when a ban is confirmed. Opening or refreshing the home page also checks.
The Security page configures anonymous API scan protection and lists its temporary bans. It also controls default-on legacy server headers and fixed MySQL 3306 / Redis 6379 honeypots. Honeypots block recognizable protocol probes; a TCP connection alone does not trigger a ban.

Login, API, and reverse proxy policies open in drawers using the Advanced settings button beside each switch. Drawers keep independent drafts; Cancel discards the draft and Save persists settings. Reverse proxy security is opt-in and supports trusted proxy CIDRs, client IP headers, external HTTPS/origin checks, and configurable security headers including optional HSTS.

To preview the notice, use `/?preview=true#/banned` or `/#/banned?preview=true`.
Only the exact value `true` enables preview. This changes presentation only;
it does not enable network blocking or change the device's access policy.

## Requirements

- Node.js 20 LTS or newer is recommended
- pnpm compatible with lockfile format 9
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

For transport, network, update, or recovery changes, also exercise the feature
against a device because browser-only type checks cannot validate Core protocol
compatibility or reconnect behavior.

## License

This project is licensed under the GNU General Public License v3.0. See
[LICENSE](LICENSE) for the complete terms.
