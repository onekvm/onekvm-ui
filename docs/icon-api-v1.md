# OneKVM Icon API v1

Main-UI components import icons from `@/icons`, not a rendering library.
Named imports such as `Monitor`, `Settings`, and `KeyboardChord` are stable
component handles: they resolve the active set at render time, so an already
mounted toolbar or plugin follows theme changes without reloading.

`iconComponent('monitor')` looks up a handle dynamically. Public names use
kebab case; PascalCase names and existing aliases are also accepted.
`iconComponent()` returns `undefined` for unknown names, allowing callers to
choose a fallback. Never use a themed handle as a glyph inside another set.

The built-in `outline` set supplies the existing glyphs. Its library is an
adapter detail in `src/icons/defaults.ts`. Custom sets contain Vue components,
which may render SVG or images, and can override only the icons they need.
Unspecified icons inherit from `extends`, which defaults to `outline`.
The default set cannot be overwritten.

The built-in `win98` set overrides host device, navigation, settings, and window
control glyphs with unmodified SE98 PNGs from [nestoris/Win98SE](https://github.com/nestoris/Win98SE).
Its SVG wrapper preserves sizing, accessibility attributes, and layout selectors;
16, 24, and 32 pixel variants use nearest-neighbor rendering. Unmapped glyphs
inherit `outline`. Assets are served locally with their [upstream license and
provenance](../public/icons/win98/NOTICE.md); no external image requests are needed.
The network-interface glyph deliberately uses SE98's original 48-pixel
`audio-card` bitmap at each display size, showing the bare card without a speaker.
USB uses the USB-device artwork; service settings use the separate gear glyph.
`Win98Theme` is a separate handle for the theme menu's Windows flag. Its default
glyph also uses that flag, so it is recognizable in Light and Dark menus.
Window controls and application-window icons retain their own artwork.

Register sets through `uiProduct.iconSets` or at runtime:

```js
const { h } = window.OneKVMPluginUI.v1.vue

window.OneKVMIcons.v1.register({
  id: 'retro',
  name: 'Retro',
  extends: 'outline',
  icons: {
    monitor: (props, { attrs }) => h('img', {
      ...attrs,
      src: '/my-theme/monitor.svg',
      width: props.size || 24,
      height: props.size || 24,
      alt: '',
    }),
  },
})

window.OneKVMTheme.v1.register({
  id: 'win98-retro',
  name: 'Win98 Retro',
  appearance: 'light',
  extends: 'win98',
  iconSet: 'retro',
  tokens: {},
})
window.OneKVMTheme.v1.activate('win98-retro')
```

Glyphs receive `size`, `color`, `strokeWidth`, and `absoluteStrokeWidth` when
provided. Forward CSS classes, styles, accessibility attributes, listeners, and
slots to the rendered element as appropriate. The host adds `data-onekvm-icon`
to identify the logical icon without depending on library CSS class names.
Brand logos and custom extension images retain their own assets.

`window.OneKVMIcons.v1` also exposes `get(name)`, `current()`, and `list()`.
Theme selection controls the active set. If its set has not been registered,
the UI uses `outline` until that set arrives. Registration then updates the
mounted icons automatically. Replacing an active custom set also updates them.
Set IDs are stored with the theme, so persisted and product-default theme
selection use the same mechanism as colors.

The active set is available on `<html data-onekvm-icon-set="…">`. Changes
dispatch `onekvm-icon-set-change` on `window` with `{ id, name }` as detail.

`window.OneKVMPluginUI.v1.icons` preserves its PascalCase keys and now returns
the same themed handles. Existing extension manifests using `source: 'lucide'`
remain compatible; their names resolve through this layer. A manifest's custom
image and explicit brand assets keep their original precedence.
Custom icons returned as a manifest path are loaded through the extension asset
URL using the extension ID and version, so details and installed lists can show
the same image as package previews and the marketplace.

Recovery uses a separate boot-time bundle and does not load this runtime.
