import assert from 'node:assert/strict'
import { usbEndpointUse, usbFunctionsFit } from '../src/lib/usb-capacity.ts'
import type { OneKVMConfig, USBConfig } from '../src/api/client.ts'

const usb = { keyboard_no_out: true, mass_storage: false, mtp: false, gamepad: false } as USBConfig
const audio = { enabled: false, microphone: false } as OneKVMConfig['audio']
const gadget = { in_limit: 5, out_limit: 1, mass_storage: true, mtp: false, mtp_available: true }
assert.deepEqual(usbEndpointUse(usb, audio, gadget), { inn: 3, out: 0 })
const sharing = { ...usb, network_sharing: true }
assert.deepEqual(usbEndpointUse(sharing, audio, gadget), { inn: 5, out: 1 })
assert.equal(usbFunctionsFit(sharing, audio, gadget), true)
assert.equal(usbFunctionsFit(sharing, audio, gadget, { storage: true }), false)
assert.equal(usbFunctionsFit(sharing, audio, gadget, { mtp: true }), false)
assert.equal(usbFunctionsFit(sharing, audio, gadget, { microphone: true }), false)
assert.equal(usbFunctionsFit(sharing, audio, gadget, { audio: true }), false)
assert.deepEqual(usbEndpointUse(sharing, audio, gadget, { network: false }), { inn: 3, out: 0 })
console.log('USB network sharing capacity tests passed')
