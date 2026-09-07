import assert from 'node:assert/strict'

import {
  edidCurrentSummary,
  edidRequiresRestart,
  edidSelectOptions,
  encodeEdidSelection,
  machinePresetLabel,
  parseEdidSelection,
} from '../src/lib/edid.ts'

assert.equal(machinePresetLabel('factory', 'Factory'), 'Factory')
assert.equal(machinePresetLabel('1080p60', 'Factory'), '1920×1080 @ 60 Hz')
assert.equal(machinePresetLabel('custom-id', 'Factory'), 'custom-id')

const encoded = encodeEdidSelection({ extension: 'edid-editor', directory: 'presets', id: '1080p60' })
assert.deepEqual(parseEdidSelection(encoded), {
  extension: 'edid-editor',
  directory: 'presets',
  id: '1080p60',
})
assert.equal(parseEdidSelection('incomplete'), null)

assert.equal(edidRequiresRestart('hotplug'), false)
assert.equal(edidRequiresRestart('none'), false)
assert.equal(edidRequiresRestart('reboot'), true)
assert.equal(edidRequiresRestart('power_cycle'), true)

const options = edidSelectOptions({
  supported: true,
  directories: [
    {
      extension: 'edid-editor',
      id: 'presets',
      role: 'preset',
      writable: false,
      files: [{ id: 'factory', size: 256 }, { id: '1080p60', size: 256 }],
    },
    {
      extension: 'edid-editor',
      id: 'custom',
      role: 'custom',
      writable: true,
      files: [{ id: 'office', size: 256 }],
    },
  ],
}, { factory: 'Factory', presets: 'Machine presets', custom: 'Custom files' })
assert.equal(options.length, 2)
assert.equal(options[0].label, 'Machine presets')
assert.equal(options[0].children[0].label, 'Factory')
assert.equal(options[1].children[0].label, 'office.edid.bin')

assert.equal(
  edidCurrentSummary({ supported: true, summary: { preferred: { width: 1920, height: 1080, fps: 60 } } }, 'unknown'),
  '1920×1080 @ 60 Hz',
)
assert.equal(edidCurrentSummary({ supported: true }, 'unknown'), 'unknown')

console.log('edid tests passed')
