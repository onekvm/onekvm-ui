import type { OneKVMThemeAppearance } from '@/theme/types'

const dark = {
  background: '#11161a',
  foreground: '#c5ced5',
  cursor: '#11161a',
  selectionBackground: '#345d55',
  black: '#11161a',
  brightBlack: '#65717b',
  red: '#df6262',
  brightRed: '#f07878',
  green: '#42d2a4',
  brightGreen: '#63dfb6',
  yellow: '#d6a746',
  brightYellow: '#e7bc61',
  blue: '#61aef4',
  brightBlue: '#7bbdf7',
  magenta: '#bc8cf2',
  brightMagenta: '#cda5f5',
  cyan: '#55c9d8',
  brightCyan: '#78d7e2',
  white: '#c5ced5',
  brightWhite: '#f0f3f5',
}

const light = {
  background: '#f3f5f8',
  foreground: '#12181f',
  cursor: '#12181f',
  selectionBackground: '#c7ddff',
  black: '#12181f',
  brightBlack: '#5b6773',
  red: '#b91c1c',
  brightRed: '#dc2626',
  green: '#047857',
  brightGreen: '#059669',
  yellow: '#b45309',
  brightYellow: '#d97706',
  blue: '#1d4ed8',
  brightBlue: '#2563eb',
  magenta: '#6d28d9',
  brightMagenta: '#7c3aed',
  cyan: '#0e7490',
  brightCyan: '#0891b2',
  white: '#3a4653',
  brightWhite: '#12181f',
}

export function xtermTheme(appearance: OneKVMThemeAppearance) {
  return appearance === 'light' ? light : dark
}
