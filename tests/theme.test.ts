import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  graphiteTheme,
  oneKVMThemeCSSVariables,
  paperTheme,
  parseAppearancePreference,
  resolveAppearance,
  resolveThemeDefinition,
  themeIdForAppearance,
  win98Theme,
} from '../src/theme/model.ts'
import { naiveOverridesFor } from '../src/theme/naive.ts'
import { oneKVMThemeTokenNames } from '../src/theme/types.ts'

const themes = new Map([[graphiteTheme.id, graphiteTheme]])
const custom = resolveThemeDefinition({
  id: 'rack-blue',
  name: 'Rack Blue',
  appearance: 'dark',
  extends: 'graphite',
  tokens: {
    primary: '#2563eb',
    radius: '4px',
  },
}, themes)

assert.equal(custom.tokens.primary, '#2563eb')
assert.equal(custom.tokens.radius, '4px')
assert.equal(custom.tokens.background, graphiteTheme.tokens.background)
assert.equal(custom.iconSet, 'outline')
assert.equal(custom.skin, 'default')
assert.equal(win98Theme.skin, 'classic')
assert.equal(win98Theme.iconSet, 'win98')
assert.match(win98Theme.tokens.titlebarActive, /^linear-gradient\(/)
assert.match(win98Theme.tokens.titlebarInactive, /^linear-gradient\(/)
const themedIcons = resolveThemeDefinition({
  id: 'win98-retro', name: 'Retro', appearance: 'light', extends: 'win98',
  iconSet: 'retro', tokens: {},
}, new Map([[win98Theme.id, win98Theme]]))
assert.equal(themedIcons.iconSet, 'retro')
assert.equal(themedIcons.skin, 'classic')
assert.equal(themedIcons.tokens.background, win98Theme.tokens.background)
assert.equal(resolveThemeDefinition({
  id: 'retro-child', name: 'Child', appearance: 'light', extends: 'win98-retro', tokens: {},
}, new Map([[themedIcons.id, themedIcons]])).iconSet, 'retro')
assert.equal(resolveThemeDefinition({
  id: 'plain-retro', name: 'Plain', appearance: 'light', extends: 'win98', skin: 'default', tokens: {},
}, new Map([[win98Theme.id, win98Theme]])).skin, 'default')
assert.equal(Object.keys(oneKVMThemeCSSVariables).length, oneKVMThemeTokenNames.length)
assert.equal(paperTheme.appearance, 'light')
assert.equal(paperTheme.tokens.videoStage, graphiteTheme.tokens.videoStage)
assert.ok(paperTheme.tokens.surfaceOverlay.includes('255 255 255'))
assert.notEqual(paperTheme.tokens.mutedForeground, paperTheme.tokens.background)
const paperUi = naiveOverridesFor(paperTheme)
const classicUi = naiveOverridesFor(win98Theme)
assert.equal(classicUi.InternalSelectMenu?.color, win98Theme.tokens.input)
assert.equal(classicUi.InternalSelectMenu?.optionColorActive, win98Theme.tokens.primary)
assert.equal(classicUi.InternalSelectMenu?.optionTextColorActive, win98Theme.tokens.primaryForeground)
assert.equal(paperUi.Tooltip?.textColor, paperTheme.tokens.popoverForeground)
assert.equal(paperUi.Tooltip?.color, paperTheme.tokens.popover)
assert.equal(paperUi.Popover?.textColor, paperTheme.tokens.popoverForeground)
assert.equal(paperUi.Menu?.itemTextColorActive, paperTheme.tokens.primary)
assert.equal(paperUi.Input?.border, `1px solid ${paperTheme.tokens.border}`)
assert.equal(paperUi.InternalSelection?.border, paperUi.Input?.border)
assert.equal(paperUi.InternalSelection?.color, paperUi.Input?.color)
const graphiteUi = naiveOverridesFor(graphiteTheme)
assert.equal(graphiteUi.InternalSelection?.border, graphiteUi.Input?.border)
assert.equal(graphiteUi.InternalSelection?.borderHover, graphiteUi.Input?.borderHover)
for (const tokenName of oneKVMThemeTokenNames) {
  assert.equal(typeof paperTheme.tokens[tokenName], 'string', `paper missing ${tokenName}`)
}

assert.equal(parseAppearancePreference('system'), 'system')
assert.equal(parseAppearancePreference('nope'), 'dark')
assert.equal(resolveAppearance('system', true), 'light')
assert.equal(resolveAppearance('system', false), 'dark')
assert.equal(resolveAppearance('light', false), 'light')
assert.equal(resolveAppearance('dark', true), 'dark')

const catalog = new Map([[graphiteTheme.id, graphiteTheme], [paperTheme.id, paperTheme]])
assert.equal(themeIdForAppearance('dark', catalog, 'graphite'), 'graphite')
assert.equal(themeIdForAppearance('light', catalog, 'graphite'), 'paper')
assert.equal(themeIdForAppearance('dark', catalog, 'paper'), 'graphite')

const themeCSS = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
for (const variableName of Object.values(oneKVMThemeCSSVariables)) {
  assert.ok(themeCSS.includes(`${variableName}:`), `missing CSS fallback for ${variableName}`)
}

assert.throws(() => resolveThemeDefinition({
  id: 'Invalid Theme',
  name: 'Invalid',
  appearance: 'dark',
  tokens: {},
}, themes), /Invalid OneKVM theme ID/)

assert.throws(() => resolveThemeDefinition({
  id: 'missing-base',
  name: 'Missing base',
  appearance: 'dark',
  extends: 'not-registered',
  tokens: {},
}, themes), /Unknown OneKVM base theme/)

assert.throws(() => resolveThemeDefinition({
  id: 'empty-token',
  name: 'Empty token',
  appearance: 'dark',
  tokens: { primary: ' ' },
}, themes), /Invalid primary token/)

assert.throws(() => resolveThemeDefinition({
  id: 'self-base',
  name: 'Self base',
  appearance: 'dark',
  extends: 'self-base',
  tokens: {},
}, themes), /cannot extend itself/)

console.log('theme tests passed')
