import type { GamepadReport } from '@/lib/onekvm'

export const GAMEPAD_HAT_NEUTRAL = 8
export const GAMEPAD_AXIS_CENTER = 128

const HID_GENERIC_DESKTOP = 0x01
const HID_BUTTON = 0x09
const HID_USAGE_JOYSTICK = 0x04
const HID_USAGE_GAMEPAD = 0x05
const HID_USAGE_X = 0x30
const HID_USAGE_Y = 0x31
const HID_USAGE_Z = 0x32
const HID_USAGE_RX = 0x33
const HID_USAGE_RY = 0x34
const HID_USAGE_RZ = 0x35
const HID_USAGE_HAT = 0x39

export const idleGamepadReport = (): GamepadReport => ({
  buttons: 0,
  hat: GAMEPAD_HAT_NEUTRAL,
  lx: GAMEPAD_AXIS_CENTER,
  ly: GAMEPAD_AXIS_CENTER,
  rx: GAMEPAD_AXIS_CENTER,
  ry: GAMEPAD_AXIS_CENTER,
  lt: 0,
  rt: 0,
})

export function gamepadReportsEqual(left: GamepadReport, right: GamepadReport) {
  return left.buttons === right.buttons &&
    left.hat === right.hat &&
    left.lx === right.lx &&
    left.ly === right.ly &&
    left.rx === right.rx &&
    left.ry === right.ry &&
    left.lt === right.lt &&
    left.rt === right.rt
}

export function webHIDSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.hid)
}

export function hatFromDpad(up: boolean, down: boolean, left: boolean, right: boolean) {
  if (up && !down && !left && !right) return 0
  if (up && right && !down && !left) return 1
  if (right && !up && !down && !left) return 2
  if (down && right && !up && !left) return 3
  if (down && !up && !left && !right) return 4
  if (down && left && !up && !right) return 5
  if (left && !up && !down && !right) return 6
  if (up && left && !down && !right) return 7
  return GAMEPAD_HAT_NEUTRAL
}

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

function axisToByte(value: number) {
  return clampByte((value + 1) * 127.5)
}

function analogButtonToByte(button: GamepadButton | undefined) {
  if (!button) return 0
  if (button.value > 0) return clampByte(button.value * 255)
  return button.pressed ? 255 : 0
}

export function fromStandardGamepad(pad: Gamepad): GamepadReport {
  const buttons = pad.buttons
  const axes = pad.axes
  let mask = 0
  if (buttons[0]?.pressed) mask |= 1 << 0
  if (buttons[1]?.pressed) mask |= 1 << 1
  if (buttons[2]?.pressed) mask |= 1 << 2
  if (buttons[3]?.pressed) mask |= 1 << 3
  if (buttons[4]?.pressed) mask |= 1 << 4
  if (buttons[5]?.pressed) mask |= 1 << 5
  if (buttons[10]?.pressed) mask |= 1 << 6
  if (buttons[11]?.pressed) mask |= 1 << 7
  if (buttons[8]?.pressed) mask |= 1 << 8
  if (buttons[9]?.pressed) mask |= 1 << 9
  if (buttons[16]?.pressed) mask |= 1 << 10
  return {
    buttons: mask,
    hat: hatFromDpad(
      Boolean(buttons[12]?.pressed),
      Boolean(buttons[13]?.pressed),
      Boolean(buttons[14]?.pressed),
      Boolean(buttons[15]?.pressed),
    ),
    lx: axisToByte(axes[0] ?? 0),
    ly: axisToByte(axes[1] ?? 0),
    rx: axisToByte(axes[2] ?? 0),
    ry: axisToByte(axes[3] ?? 0),
    lt: analogButtonToByte(buttons[6]),
    rt: analogButtonToByte(buttons[7]),
  }
}

function scaleAxis(value: number, logicalMin: number, logicalMax: number) {
  if (logicalMax <= logicalMin) return GAMEPAD_AXIS_CENTER
  const normalized = (value - logicalMin) / (logicalMax - logicalMin)
  return clampByte(normalized * 255)
}

function readBits(bytes: Uint8Array, bitOffset: number, bitSize: number) {
  let value = 0
  for (let index = 0; index < bitSize; index += 1) {
    const bit = bitOffset + index
    const byte = bytes[bit >> 3]
    if (byte === undefined) break
    if (byte & (1 << (bit & 7))) value |= 1 << index
  }
  return value
}

function signedLogical(value: number, bitSize: number, logicalMin: number) {
  if (logicalMin >= 0) return value
  const sign = 1 << (bitSize - 1)
  return value & sign ? value - (1 << bitSize) : value
}

function usageName(usage?: number) {
  return (usage ?? 0) & 0xffff
}

function usagePage(usage?: number) {
  return ((usage ?? 0) >> 16) & 0xffff
}

function isGamepadCollection(collection: HIDCollectionInfo) {
  const page = collection.usagePage || usagePage(collection.usage)
  const usage = collection.usage || usageName(collection.usage)
  return page === HID_GENERIC_DESKTOP && (usage === HID_USAGE_GAMEPAD || usage === HID_USAGE_JOYSTICK)
}

function walkCollections(collections: HIDCollectionInfo[], visit: (collection: HIDCollectionInfo) => void) {
  for (const collection of collections) {
    visit(collection)
    if (collection.children?.length) walkCollections(collection.children, visit)
  }
}

export function hidGamepadFilters(): HIDDeviceFilter[] {
  return [
    { usagePage: HID_GENERIC_DESKTOP, usage: HID_USAGE_GAMEPAD },
    { usagePage: HID_GENERIC_DESKTOP, usage: HID_USAGE_JOYSTICK },
  ]
}

export function deviceLooksLikeGamepad(device: HIDDevice) {
  let matched = false
  walkCollections(device.collections || [], (collection) => {
    if (isGamepadCollection(collection)) matched = true
  })
  return matched
}

export function fromHIDInputReport(device: HIDDevice, reportId: number, data: DataView): GamepadReport | null {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  let matched = false
  const report = idleGamepadReport()
  walkCollections(device.collections || [], (collection) => {
    if (!isGamepadCollection(collection)) return
    const reports = collection.inputReports || []
    for (const hidReport of reports) {
      if ((hidReport.reportId || 0) !== reportId) continue
      matched = true
      let bitOffset = 0
      let buttonBit = 0
      for (const item of hidReport.items || []) {
        const count = item.reportCount || 0
        const size = item.reportSize || 0
        const logicalMin = item.logicalMinimum ?? 0
        const logicalMax = item.logicalMaximum ?? ((1 << size) - 1)
        const usages = item.usages?.length
          ? item.usages
          : usageRange(item.usageMinimum, item.usageMaximum, count)
        if (item.isConstant) {
          bitOffset += size * count
          continue
        }
        for (let index = 0; index < count; index += 1) {
          const raw = readBits(bytes, bitOffset, size)
          const value = signedLogical(raw, size, logicalMin)
          const usage = usages[index] ?? usages[0] ?? 0
          const page = usagePage(usage) || collection.usagePage
          const name = usageName(usage)
          if (page === HID_BUTTON || (page === 0 && name >= 1 && name <= 16 && size === 1)) {
            if (value) report.buttons |= 1 << Math.min(15, buttonBit)
            buttonBit += 1
          } else if (page === HID_GENERIC_DESKTOP || page === 0) {
            switch (name) {
              case HID_USAGE_HAT:
                report.hat = hatFromHidValue(value, logicalMin, logicalMax, Boolean(item.hasNull))
                break
              case HID_USAGE_X:
                report.lx = scaleAxis(value, logicalMin, logicalMax)
                break
              case HID_USAGE_Y:
                report.ly = scaleAxis(value, logicalMin, logicalMax)
                break
              case HID_USAGE_Z:
                report.rx = scaleAxis(value, logicalMin, logicalMax)
                break
              case HID_USAGE_RZ:
                report.ry = scaleAxis(value, logicalMin, logicalMax)
                break
              case HID_USAGE_RX:
                report.lt = scaleAxis(value, logicalMin, logicalMax)
                break
              case HID_USAGE_RY:
                report.rt = scaleAxis(value, logicalMin, logicalMax)
                break
              default:
                break
            }
          }
          bitOffset += size
        }
      }
    }
  })
  return matched ? report : null
}

function usageRange(minimum?: number, maximum?: number, count?: number) {
  if (minimum == null || maximum == null) return []
  const values: number[] = []
  const last = Math.max(minimum, maximum)
  for (let usage = minimum; usage <= last && values.length < (count || 0); usage += 1) {
    values.push(usage)
  }
  return values
}

function hatFromHidValue(value: number, logicalMin: number, logicalMax: number, hasNull: boolean) {
  if (hasNull && (value < logicalMin || value > logicalMax)) return GAMEPAD_HAT_NEUTRAL
  const hat = value - logicalMin
  if (hat < 0 || hat > 7) return GAMEPAD_HAT_NEUTRAL
  return hat
}
