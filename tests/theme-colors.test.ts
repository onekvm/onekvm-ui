import assert from 'node:assert/strict'
import {
  colorContrastRatio,
  customThemeColorIssue,
  normalizeHexColor,
  normalizeThemeColors,
  parseThemeColorPreferences,
  resolveCustomThemeColors,
} from '../src/theme/colors.ts'
import { graphiteTheme, paperTheme, win98Theme } from '../src/theme/model.ts'
import { naiveOverridesFor } from '../src/theme/naive.ts'

assert.equal(normalizeHexColor(' #AbC '), '#aabbcc')
assert.equal(normalizeHexColor('#ABCDEF'), '#abcdef')
for (const value of ['', '#abcd', '#1234567', 'red', 'var(--primary)', '#123456; color:red', null, 42]) {
  assert.equal(normalizeHexColor(value), null)
}
assert.deepEqual(normalizeThemeColors({ primary: '#abc', card: '#123456', unknown: 'ignored' }), { primary: '#aabbcc', card: '#123456' })
assert.equal(normalizeThemeColors({ primary: '#badcolor' }), null)
assert.equal(normalizeThemeColors([]), null)
for (const raw of [null, '', 'broken', 'null', '[]', '7']) assert.deepEqual(parseThemeColorPreferences(raw), {})
assert.deepEqual(parseThemeColorPreferences(JSON.stringify({
  graphite: { primary: '#abc' }, paper: { card: '#fff' }, win98: { foreground: 'bad' },
  'Invalid Theme': { primary: '#000' }, '__proto__': { primary: '#000' },
})), { graphite: { primary: '#aabbcc' }, paper: { card: '#ffffff' } })
assert.equal(colorContrastRatio('#000', '#fff'), 21)
assert.equal(colorContrastRatio('#fff', '#fff'), 1)
assert.equal(colorContrastRatio('bad', '#fff'), 0)

const dark = resolveCustomThemeColors(graphiteTheme, {
  primary: '#f59e0b', background: '#201827', card: '#30243b', foreground: '#faf5ff',
})
const light = resolveCustomThemeColors(paperTheme, {
  primary: '#7c3aed', background: '#fff7ed', card: '#fffaf5', foreground: '#431407',
})
for (const theme of [dark, light]) {
  assert.equal(customThemeColorIssue(theme), null)
  assert.equal(theme.tokens.cardForeground, theme.tokens.foreground)
  assert.equal(theme.tokens.popoverForeground, theme.tokens.foreground)
  assert.equal(theme.tokens.input, theme.tokens.card)
  assert.equal(theme.tokens.toolbar, theme.tokens.card)
  assert.equal(theme.tokens.canvas, theme.tokens.background)
  assert.ok(colorContrastRatio(theme.tokens.mutedForeground, theme.tokens.background) >= 4.5)
  assert.ok(colorContrastRatio(theme.tokens.mutedForeground, theme.tokens.card) >= 4.5)
  const ui = naiveOverridesFor(theme)
  assert.equal(ui.common?.primaryColor, theme.tokens.primary)
  assert.equal(ui.Input?.textColor, theme.tokens.foreground)
  assert.equal(ui.Button?.textColorPrimary, theme.tokens.primaryForeground)
}
assert.equal(dark.id, graphiteTheme.id)
assert.equal(dark.skin, graphiteTheme.skin)
assert.equal(dark.iconSet, graphiteTheme.iconSet)
assert.equal(dark.tokens.videoStage, graphiteTheme.tokens.videoStage)
assert.equal(dark.tokens.success, graphiteTheme.tokens.success)
assert.equal(dark.tokens.destructive, graphiteTheme.tokens.destructive)
assert.equal(dark.tokens.warning, graphiteTheme.tokens.warning)
assert.equal(graphiteTheme.tokens.background, '#090d12')
assert.equal(resolveCustomThemeColors(graphiteTheme, {}), graphiteTheme)
assert.equal(customThemeColorIssue(resolveCustomThemeColors(graphiteTheme, { foreground: graphiteTheme.tokens.background })), 'foreground')
assert.equal(customThemeColorIssue(resolveCustomThemeColors(graphiteTheme, { primary: graphiteTheme.tokens.background })), 'primary')

// Both black and white, as well as colors near the text-contrast crossover,
// must keep button labels readable through hover and press states.
for (const base of [graphiteTheme, paperTheme, win98Theme]) {
  for (const primary of ['#000000', '#ffffff', '#777777', '#767676', '#ff0000', '#00ff00', '#0000ff', '#f59e0b']) {
    const theme = resolveCustomThemeColors(base, { primary })
    assert.equal(theme.tokens.primary, primary)
    for (const color of [theme.tokens.primary, theme.tokens.primaryHover, theme.tokens.primaryPressed]) {
      assert.ok(colorContrastRatio(color, theme.tokens.primaryForeground) >= 4.5, `${base.id} ${primary} ${color}`)
    }
  }
}
const classic = resolveCustomThemeColors(win98Theme, { primary: '#800040' })
assert.equal(classic.skin, 'classic')
assert.equal(classic.iconSet, 'win98')
assert.match(classic.tokens.titlebarActive, /#800040/)
assert.equal(classic.tokens.titlebarInactive, win98Theme.tokens.titlebarInactive)

console.log('theme color tests passed')
