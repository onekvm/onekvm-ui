import assert from 'node:assert/strict'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { readFileSync } from 'node:fs'

import { AppWindow, CheckCircle2, CircleCheck, KeyboardChord, Monitor, Win98Theme, icons, iconComponent } from '../src/icons/index.ts'
import { activateIconSet, registerIconSet } from '../src/icons/runtime.ts'
import { namedPluginIcon, pluginIcon } from '../src/lib/plugin-icons.ts'

const render = (component: Component, props = {}) => renderToString(createSSRApp({ render: () => h(component, props) }))
const glyph = (label: string) => (_props: unknown, { attrs }: { attrs: Record<string, unknown> }) => h('svg', { ...attrs, 'data-test-glyph': label })

assert.equal(iconComponent('monitor'), Monitor)
assert.equal(iconComponent('Monitor'), Monitor)
assert.equal(icons.Monitor, Monitor)
assert.equal(CheckCircle2, CircleCheck)
assert.equal(iconComponent('check-circle-2'), CircleCheck)
assert.equal(iconComponent('no-such-icon'), undefined)
assert.equal(iconComponent('__proto__'), undefined)
assert.equal(iconComponent('constructor'), undefined)
assert.equal(namedPluginIcon('no-such-icon', Monitor), Monitor)
assert.match(await render(KeyboardChord), /<rect/)

// A handle obtained before registration must switch along with mounted UI.
const handle = icons.Monitor!
const original = await render(handle, { size: 18, class: 'toolbar-icon', 'aria-label': 'Screen' })
assert.match(original, /width="18"/)
assert.match(original, /class="[^"]*toolbar-icon/)
assert.match(original, /aria-label="Screen"/)
assert.match(original, /data-onekvm-icon="monitor"/)

activateIconSet('test-retro')
assert.equal(await render(handle), await render(Monitor))
registerIconSet({ id: 'test-retro', name: 'Retro', icons: { monitor: glyph('retro-monitor') } })
assert.equal(iconComponent('constructor'), undefined)
assert.match(await render(handle, { size: 20, 'aria-hidden': true }), /data-test-glyph="retro-monitor"/)
assert.match(await render(handle, { 'aria-hidden': true }), /aria-hidden="true"/)
// Missing glyphs inherit defaults, including aliases and the custom chord icon.
assert.match(await render(CircleCheck), /<path/)
assert.match(await render(KeyboardChord), /<rect/)
assert.equal(pluginIcon({ icon: { source: 'lucide', name: 'monitor' } }).component, handle)

registerIconSet({ id: 'test-child', name: 'Child', extends: 'test-retro', icons: { 'circle-check': glyph('child-check') } })
activateIconSet('test-child')
assert.match(await render(Monitor), /retro-monitor/)
assert.match(await render(CheckCircle2), /child-check/)

registerIconSet({ id: 'test-child', name: 'Updated', icons: { monitor: glyph('updated-monitor') } })
assert.match(await render(handle), /updated-monitor/)
activateIconSet('outline')
assert.equal(await render(handle, { size: 18, class: 'toolbar-icon', 'aria-label': 'Screen' }), original)

// Bitmap sets preserve the existing SVG/attribute contract and use local assets.
activateIconSet('win98')
const classic = await render(handle, { size: 18, class: 'toolbar-icon', 'aria-label': 'Screen' })
assert.match(classic, /<svg[^>]+width="18"/)
assert.match(classic, /class="toolbar-icon"/)
assert.match(classic, /aria-label="Screen"/)
assert.match(classic, /data-onekvm-icon="monitor"/)
assert.match(classic, /<image href="\/icons\/win98\/16\/devices-video-display.png"/)
assert.match(await render(handle, { size: 24 }), /\/win98\/24\//)
assert.match(await render(handle, { size: 32 }), /\/win98\/32\//)
assert.notEqual(Win98Theme, AppWindow)
assert.match(await render(Win98Theme, { size: 16 }), /\/16\/places-start-here.png/)
assert.match(await render(AppWindow, { size: 16 }), /\/16\/apps-preferences-system-windows.png/)
assert.match(await render(CircleCheck), /<path/) // Unspecified glyphs retain the fallback.
const manifest = JSON.parse(readFileSync(new URL('../public/icons/win98/sources.json', import.meta.url), 'utf8'))
for (const asset of manifest.files) {
  const bytes = readFileSync(new URL(`../public/icons/win98/${asset.file}`, import.meta.url))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `invalid bitmap ${asset.file}`)
}
activateIconSet('outline')
assert.equal(await render(handle, { size: 18, class: 'toolbar-icon', 'aria-label': 'Screen' }), original)

assert.throws(() => registerIconSet({ id: 'outline', name: 'Override', icons: {} }), /Cannot replace/)
assert.throws(() => registerIconSet({ id: 'bad id', name: 'Invalid', icons: {} }), /Invalid OneKVM icon set ID/)
assert.throws(() => registerIconSet({ id: 'test-invalid', name: 'Invalid', extends: 'missing', icons: {} }), /Unknown OneKVM base/)
assert.throws(() => registerIconSet({ id: 'test-loop', name: 'Loop', extends: 'test-loop', icons: {} }), /cannot extend itself/)
assert.throws(() => registerIconSet({ id: 'test-wrapper', name: 'Wrapper', icons: { monitor: Monitor } }), /not a themed icon wrapper/)

console.log('icon set tests passed')
