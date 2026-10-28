import type { OneKVMConfig, OneKVMStatus, USBConfig } from '../api/client'

export const usbEndpointCosts = {
  keyboard: { inn: 1, out: 0 }, mouse: { inn: 2, out: 0 },
  keyboardLeds: { inn: 0, out: 1 }, audio: { inn: 0, out: 1 },
  microphone: { inn: 1, out: 0 }, gamepad: { inn: 1, out: 0 },
  storage: { inn: 1, out: 1 }, mtp: { inn: 2, out: 1 },
  network: { inn: 2, out: 1 },
} as const

export type USBGadget = NonNullable<OneKVMStatus['hid']>['gadget']
export type USBFunctionOverrides = Partial<Record<'audio' | 'microphone' | 'gamepad' | 'keyboardOut' | 'storage' | 'mtp' | 'network', boolean>>

export function usbSpeakerEnabled(audio: { enabled: boolean; source?: 'usb' | 'hdmi' }) {
  return audio.enabled && (audio.source || 'usb') === 'usb'
}

export function usbEndpointUse(usb: USBConfig, audio: OneKVMConfig['audio'], gadget?: USBGadget, overrides: USBFunctionOverrides = {}) {
  const features = {
    keyboard: true, mouse: true,
    keyboardLeds: overrides.keyboardOut ?? !usb.keyboard_no_out,
    audio: overrides.audio ?? usbSpeakerEnabled(audio),
    microphone: overrides.microphone ?? Boolean(audio.microphone),
    gamepad: overrides.gamepad ?? Boolean(usb.gamepad),
    network: overrides.network ?? Boolean(usb.network_sharing),
    storage: (gadget?.mass_storage ?? true) && (overrides.storage ?? usb.mass_storage !== false),
    mtp: (gadget?.mtp_available ?? Boolean(gadget?.mtp)) && (overrides.mtp ?? usb.mtp !== false),
  }
  let inn = 0, out = 0
  for (const feature of Object.keys(features) as (keyof typeof features)[]) {
    if (!features[feature]) continue
    inn += usbEndpointCosts[feature].inn
    out += usbEndpointCosts[feature].out
  }
  return { inn, out }
}

export function usbFunctionsFit(usb: USBConfig, audio: OneKVMConfig['audio'], gadget?: USBGadget, overrides: USBFunctionOverrides = {}) {
  if (!gadget || (gadget.in_limit <= 0 && gadget.out_limit <= 0)) return true
  const used = usbEndpointUse(usb, audio, gadget, overrides)
  return used.inn <= gadget.in_limit && used.out <= gadget.out_limit
}
