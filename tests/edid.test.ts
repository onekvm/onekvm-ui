import assert from 'node:assert/strict'

import {
  edidCurrentSummary,
  edidAspectRatio,
  filterEdidOption,
  edidRequiresRestart,
  edidSelectOptions,
  encodeEdidSelection,
  machinePresetLabel,
  parseEdidSelection,
  supportsHdmiReset,
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

assert.equal(supportsHdmiReset(null), false)
assert.equal(supportsHdmiReset({ supported: false, writable: true, hotplug: true }), false)
assert.equal(supportsHdmiReset({ supported: true, writable: false, hotplug: true }), false)
assert.equal(supportsHdmiReset({ supported: true, writable: true }), false)
assert.equal(supportsHdmiReset({ supported: true, writable: true, hotplug: true, apply_policy: 'reboot' }), false)
assert.equal(supportsHdmiReset({ supported: true, writable: true, hotplug: true, apply_policy: 'power_cycle' }), false)
assert.equal(supportsHdmiReset({ supported: true, writable: true, hotplug: true, apply_policy: 'hotplug' }), true)

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
}, { factory: 'Factory', presets: 'Machine presets', common: 'Common', custom: 'Custom files' })
assert.equal(options.length, 4)
assert.equal(options[0].label, 'Common')
assert.equal(options[0].children[0].label, '1080p / FHD · 1920×1080 @ 60 Hz')
assert.deepEqual(parseEdidSelection(options[0].children[0].value), parseEdidSelection(options[2].children[0].value))
assert.equal(options[1].label, 'Machine presets')
assert.equal(options[1].children[0].label, 'Factory')
assert.equal(options[2].label, '16:9')
assert.equal(options[3].children[0].label, 'office.edid.bin')

assert.equal(machinePresetLabel('480x480p60', 'Factory'), '480×480 @ 60 Hz')
assert.equal(edidAspectRatio(854, 480), '16:9')
assert.equal(edidAspectRatio(2048, 1080), '17:9')
assert.equal(edidAspectRatio(2560, 1080), '21:9')
assert.equal(edidAspectRatio(1080, 1920), '9:16')
assert.equal(edidAspectRatio(1100, 1000), undefined)
const option = { label: '1920×1080 @ 60 Hz', search: '1920×1080 @ 60 Hz 1080p60 16:9' }
for (const query of ['1920x1080', '1920 × 1080', '16:9 60', '1080p', '60 Hz']) {
  assert.equal(filterEdidOption(query, option), true, query)
}
assert.equal(filterEdidOption('4:3', option), false)
assert.equal(filterEdidOption('120 Hz', option), false)
assert.equal(filterEdidOption('60 Hz', { label: '3840×2160 @ 30 Hz' }), false)
assert.equal(filterEdidOption('1920 x 1080', { label: '1920×600 @ 60 Hz 1080p' }), false)
assert.equal(filterEdidOption('office', { label: 'office.edid.bin' }), true)

const proOptions = edidSelectOptions({ supported: true, directories: [{
  extension: 'edid-editor', id: 'presets', role: 'preset', writable: false,
  files: ['2160p30', '1440p60', '1440p30', '1080p60', '2048x1080p60'].map((id) => ({ id, size: 256 })),
}] }, { factory: 'Factory', presets: 'Machine presets', common: 'Common', custom: 'Custom' })
const leaves = proOptions.flatMap((group) => group.children)
assert.equal(new Set(leaves.map((option) => option.value)).size, leaves.length)
for (const [query, id] of [['4K30', '2160p30'], ['2K 60 Hz', '1440p60'], ['QHD30', '1440p30']]) {
  const matches = leaves.filter((option) => filterEdidOption(query!, option))
  assert.equal(matches.length, 2, query)
  assert.ok(matches.every((option) => parseEdidSelection(option.value)?.id === id), query)
}
// DCI 2048x1080 remains in 17:9 and must not match the QHD 2K alias.
assert.ok(!leaves.some((option) => filterEdidOption('2K', option) && parseEdidSelection(option.value)?.id === '2048x1080p60'))

assert.equal(
  edidCurrentSummary({ supported: true, summary: { preferred: { width: 1920, height: 1080, fps: 60 } } }, 'unknown'),
  '1920×1080 @ 60 Hz',
)
assert.equal(edidCurrentSummary({ supported: true }, 'unknown'), 'unknown')

console.log('edid tests passed')
