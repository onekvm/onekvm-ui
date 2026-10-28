import assert from 'node:assert/strict'
import { audioConfigPatch, normalizeAudioConfig } from '../src/lib/audio-settings.ts'
import { usbEndpointUse, usbFunctionsFit } from '../src/lib/usb-capacity.ts'
import type { USBConfig } from '../src/api/client.ts'

const audio = normalizeAudioConfig({ enabled: true, device: 'hw:UAC1Gadget,0' })
const usb = { keyboard_no_out: true, mass_storage: true, mtp: false, gamepad: false } as USBConfig
const gadget = { in_limit: 4, out_limit: 1, mass_storage: true, mtp: false, mtp_available: false }
const hdmi = { ...audio, source: 'hdmi' as const }
assert.equal(audio.source, 'usb')
assert.equal(usbEndpointUse(usb, audio, gadget).out, 2)
assert.equal(usbEndpointUse(usb, hdmi, gadget).out, 1)
assert.equal(usbFunctionsFit(usb, audio, gadget), false)
assert.equal(usbFunctionsFit(usb, hdmi, gadget), true)
// Microphone capacity is independent of HDMI/USB capture.
assert.equal(usbEndpointUse(usb, { ...hdmi, microphone: true }, gadget).inn, 5)
assert.equal(usbFunctionsFit(usb, { ...hdmi, microphone: true }, gadget), false)
// A source-only edit must not resend quality, channels or microphone settings.
assert.deepEqual(audioConfigPatch(audio, hdmi), { source: 'hdmi' })
// A stale draft changing quality leaves a newer popover selection untouched.
assert.deepEqual(audioConfigPatch(audio, { ...audio, quality: 'high' }), { quality: 'high' })
assert.deepEqual(normalizeAudioConfig(hdmi), { ...audio, source: 'hdmi' })
console.log('audio settings and USB capacity tests passed')
