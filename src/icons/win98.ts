import { h, type FunctionalComponent } from 'vue'

import { WIN98_ICON_SET_ID, type OneKVMIconProps, type OneKVMIconSetDefinition } from './types.ts'
import { win98IconAssets } from './win98-assets.ts'

/** Keep an SVG root so existing icon sizing, focus, and layout contracts apply. */
function bitmapIcon(asset: string): FunctionalComponent<OneKVMIconProps> {
  const Icon: FunctionalComponent<OneKVMIconProps> = (props, { attrs }) => {
    const size = props.size ?? 24
    const pixels = Number.parseFloat(String(size))
    const sourceSize = pixels <= 20 ? 16 : pixels <= 28 ? 24 : 32
    return h('svg', {
      ...attrs,
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: `0 0 ${sourceSize} ${sourceSize}`,
      fill: 'none',
      'data-onekvm-bitmap': '',
    }, [h('image', {
      href: `/icons/win98/${sourceSize}/${asset}.png`,
      width: sourceSize,
      height: sourceSize,
      style: { imageRendering: 'pixelated' },
    })])
  }
  Icon.inheritAttrs = false
  Icon.props = ['size', 'color', 'strokeWidth', 'absoluteStrokeWidth']
  return Icon
}

// The theme choice keeps its Windows flag even when the host uses outline icons.
export const win98ThemeGlyph = bitmapIcon(win98IconAssets.Win98Theme!)

export const win98IconSet: OneKVMIconSetDefinition = {
  id: WIN98_ICON_SET_ID,
  name: 'Win98 SE',
  extends: 'outline',
  icons: Object.fromEntries(Object.entries(win98IconAssets).map(([name, asset]) => [name, bitmapIcon(asset)])),
}
