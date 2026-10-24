# OneKVM Theme API v1

The main UI uses library-neutral semantic tokens. Naive UI is an internal
renderer detail and is not part of the theme contract.

Icons have a separate [icon set contract](icon-api-v1.md). A theme's optional
`iconSet` selects that set; it is inherited from the base theme when omitted.
Graphite and Paper use `outline`; Win98 uses the bundled `win98` bitmap set.
A custom theme can combine the Win98 palette with its own icons by extending
`win98` and specifying `iconSet`.

Built-in themes are `graphite` (dark), `paper` (light), and `win98` (light).
Choose Win98 from **Account → Theme → Win98** for silver surfaces, navy actions,
and a teal workspace. The selection is saved in this browser; the remote video
keeps its dark surround. Choosing Light, Dark, or System restores the default
palette for that appearance.

Win98 also selects `skin: 'classic'`: square raised/pressed toolbar buttons,
navy-to-blue gradient titlebars, an inset navigation tree, and rectangular host menus.
`titlebarActive` and `titlebarInactive` tokens accept CSS backgrounds; the inactive
Win98 titlebar uses a gray gradient. Control popovers and mobile sheets share the
active titlebar, with square controls and readable heading subtitles. Teleported
control menus and host help popovers also receive the classic frame.
Tooltips, slider value tips, and chart tips use a pale-yellow information surface,
a one-pixel text-colored border, square corners, and the classic font. Tooltips
have no arrow or raised panel shadow. Hovered or keyboard-highlighted toolbox
entries invert their descriptions and pin controls along with the title.
Host select controls follow [98.css](https://jdan.github.io/98.css/#dropdown):
an inset white field, a separate raised arrow button, and navy/white focus and
selection states. Host switches keep NSwitch's state, loading, and keyboard
contract while displaying an inset checkbox and pixel checkmark. Caption action
buttons use the compact 16×14 desktop treatment; narrow/coarse-pointer controls
retain 44-pixel touch targets. Audio volume sliders use an unfilled inset track
and a raised rectangular thumb, preserving drag, keyboard, disabled, and tooltip
behavior. These rules are scoped to host controls and main
settings pages, leaving plugin contents outside the structural skin.
Video connection feedback uses a silver panel and segmented inset progress bar
above the input surface and startup trace. Square status LEDs indicate activity
through color changes, without glow, scaling, or brightness filters.
Host tabs opt into the `host-tabs` hook for raised classic tabs joined to their
content frame. Virtual media uses these tabs and raised home selection buttons.
Host service controls, plugin manager status tags and memory bars, and plugin
details/installer dialogs also use the classic treatment. Service drawers share
the caption and checkbox styles. Network interfaces use the original 48-pixel
SE98 `audio-card` artwork without a speaker; settings and USB have distinct gear
and USB-device glyphs.
Shared host confirmations use the same gradient caption, pixel close control,
body status icon, and raised action buttons. Their original focus, dismissal,
and asynchronous loading behavior is retained through Naive's dialog API.
The skin is applied to host chrome, window frames/titlebar controls, and mobile
navigation. Plugin page contents and the contents of plugin tool windows are
outside these structural styles. Toolbox windows reserve a three-pixel outer
frame so opaque or edge-to-edge plugin content cannot cover the classic bevel.
The same frame applies to child windows, drawers, and maximized/fullscreen tools.
Desktop classic titlebars share a 24-pixel minimum height, 16-pixel icons, and
18-pixel system-menu buttons; touch layouts retain 44-pixel button targets.
Shared host windows expose `host-window-frame`,
`host-window-titlebar`, and `host-window-actions` hooks for consistent chrome.

When the KVM input surface has native focus, all `host-window-frame` windows
render at 50% opacity. Focusing a window restores full opacity. The shared CSS
focus rule also covers teleported windows and respects reduced motion; window
entry, exit and minimize animations retain their own opacity controls.
`graphite` and `paper` use `skin: 'default'`. Custom themes inherit `skin` from
their base and can override it independently of colors and `iconSet`.
Theme summaries include `skin`, reflected as `data-onekvm-skin` on `<html>`.
All theme menu choices have their own icon, with a separate selected checkmark.

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
  `placeholderForeground`,
  `accent`, and `accentForeground`.
- Actions and state: `primary`, `primaryHover`, `primaryPressed`,
  `primaryForeground`, `destructive`, `destructiveHover`,
  `destructivePressed`, `destructiveForeground`, `success`,
  `successForeground`, `warning`, and `warningForeground`.
- Structure: `border`, `borderStrong`, `input`, `ring`, `radiusSmall`,
  `radius`, and `radiusLarge`.
- OneKVM surfaces: `toolbar`, `canvas`, `videoStage`, `surfaceInset`,
  `surfaceRaised`, `surfaceOverlay`, `titlebarActive`, `titlebarInactive`,
  `textSecondary`, `textTertiary`,
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
