import { onekvm } from '@/lib/onekvm'

export const MOUSE_BUTTON_LEFT = 1
export const MOUSE_BUTTON_RIGHT = 2

export function sendRelativeMotion(buttons: number, dx: number, dy: number, wheel = 0) {
  let remainX = Math.round(dx)
  let remainY = Math.round(dy)
  let remainWheel = Math.round(wheel)
  if (!remainX && !remainY && !remainWheel) return
  while (remainX || remainY || remainWheel) {
    const x = Math.max(-127, Math.min(127, remainX))
    const y = Math.max(-127, Math.min(127, remainY))
    const nextWheel = Math.max(-127, Math.min(127, remainWheel))
    onekvm.sendRelativeMouse(buttons, x, y, nextWheel)
    remainX -= x
    remainY -= y
    remainWheel -= nextWheel
  }
}
