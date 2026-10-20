// The only main-UI module that knows which library supplies the default glyphs.
import {
  icons as outlineGlyphs,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileCode2,
  Fingerprint,
  Globe2,
  Grid2X2,
  Layers3,
  Trash2,
  createLucideIcon,
} from '@lucide/vue'
import type { Component } from 'vue'

import { DEFAULT_ICON_SET_ID, type ResolvedOneKVMIconSet } from './types.ts'
import { win98ThemeGlyph } from './win98.ts'

const KeyboardChord = createLucideIcon('KeyboardChord', [
  ['rect', { x: '3', y: '3', width: '7', height: '7', rx: '1', key: 'ctrl' }],
  ['rect', { x: '14', y: '3', width: '7', height: '7', rx: '1', key: 'alt' }],
  ['rect', { x: '3', y: '14', width: '18', height: '7', rx: '1', key: 'delete' }],
])

const legacyAliases = {
  AlertTriangle, CheckCircle2, CircleHelp, FileCode2, Fingerprint,
  Globe2, Grid2X2, Layers3, Trash2,
}

const aliases = new Map<string, string>()
const glyphNames = new Map<Component, string>()
const glyphs: Record<string, Component> = Object.create(null)

function lookupKey(name: string) {
  return name.replace(/-/g, '').toLowerCase()
}

const hostGlyphs = { KeyboardChord, Win98Theme: win98ThemeGlyph }

for (const [name, glyph] of Object.entries({ ...outlineGlyphs, ...hostGlyphs })) {
  const id = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  aliases.set(lookupKey(name), id)
  glyphNames.set(glyph, id)
  glyphs[id] = glyph
}
for (const [name, glyph] of Object.entries(legacyAliases)) {
  aliases.set(lookupKey(name), glyphNames.get(glyph)!)
}

/** Accept both public kebab-case IDs and existing PascalCase plugin names. */
export function canonicalIconName(name: string): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(name)) {
    throw new Error(`Invalid OneKVM icon name: ${name}`)
  }
  return aliases.get(lookupKey(name))
    ?? name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export const defaultIconNames = Object.freeze([
  ...Object.keys(outlineGlyphs), ...Object.keys(legacyAliases), ...Object.keys(hostGlyphs),
])

export const outlineIconSet: ResolvedOneKVMIconSet = Object.freeze({
  id: DEFAULT_ICON_SET_ID,
  name: 'Outline',
  icons: Object.freeze(glyphs),
})
