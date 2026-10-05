# OneKVM Theme API v1

The main UI uses library-neutral semantic tokens. Naive UI is an internal
renderer detail and is not part of the theme contract.

Themes can be bundled by a product through `uiProduct.themes`, or registered
at runtime through `window.OneKVMTheme.v1`:

```js
window.OneKVMTheme.v1.register({
  id: 'rack-blue',
  name: 'Rack Blue',
  appearance: 'dark',
  extends: 'graphite',
  tokens: {
    primary: '#2563eb',
    primaryHover: '#3b82f6',
    primaryPressed: '#1d4ed8',
    radius: '4px',
  },
})

window.OneKVMTheme.v1.activate('rack-blue')
```

`register()` validates the ID and resolves omitted tokens from the theme named
by `extends`. The built-in base theme is `graphite`. `activate()` persists the
selected ID in `localStorage`; a theme registered later is activated
automatically when it matches the persisted ID.

The runtime also exposes:

- `list()` — return registered theme summaries.
- `current()` — return the active theme summary.
- `activate(id)` — activate a registered theme and return whether it exists.

Theme changes dispatch `onekvm-themechange` on `window`. The event detail is
the active theme summary.

Set `uiProduct.defaultTheme` to choose a product default. A user's persisted
selection takes precedence. Product themes are registered in array order, so
place a base theme before any theme that extends it. An unknown configured
default safely falls back to `graphite`.

The token contract is grouped as follows:

- Core surfaces and text: `background`, `foreground`, `card`,
  `cardForeground`, `popover`, `popoverForeground`, `secondary`,
  `secondaryHover`, `secondaryForeground`, `muted`, `mutedForeground`,
  `accent`, and `accentForeground`.
- Actions and state: `primary`, `primaryHover`, `primaryPressed`,
  `primaryForeground`, `destructive`, `destructiveHover`,
  `destructivePressed`, `destructiveForeground`, `success`,
  `successForeground`, `warning`, and `warningForeground`.
- Structure: `border`, `borderStrong`, `input`, `ring`, `radiusSmall`,
  `radius`, and `radiusLarge`.
- OneKVM surfaces: `toolbar`, `canvas`, `videoStage`, `surfaceInset`,
  `surfaceRaised`, `surfaceOverlay`, `textSecondary`, `textTertiary`,
  `shadowPopover`, and `shadowPanel`.
- Charts: `chartFps`, `chartBitrate`, and `chartGrid`.

Theme authors can provide only the tokens they want to change when using
`extends`. CSS authored for the main UI should consume the semantic variables
documented by `oneKVMThemeCSSVariables`; it should not hard-code Naive UI
variables. Recovery UI has a separate boot-time bundle and is intentionally
outside this runtime API.

Themes should keep status colors semantic: blue for primary actions, green
for healthy/connected states, amber for warning or paused states, and red for
destructive/error states. Chart colors may be overridden independently from
status colors.
