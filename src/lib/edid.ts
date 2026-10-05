import type { EDIDStatus } from '@/api/client'

export type EdidLibraryRef = { extension: string; directory: string; id: string }

export type EdidSelectOption =
  | { type: 'group'; label: string; key: string; children: Array<{ label: string; value: string }> }

const SEPARATOR = '\0'

export function encodeEdidSelection(ref: EdidLibraryRef) {
  return `${ref.extension}${SEPARATOR}${ref.directory}${SEPARATOR}${ref.id}`
}

export function parseEdidSelection(value: string): EdidLibraryRef | null {
  const [extension, directory, id] = value.split(SEPARATOR)
  if (!extension || !directory || !id) return null
  return { extension, directory, id }
}

export function machinePresetLabel(id: string, factoryLabel: string) {
  switch (id) {
    case 'factory':
      return factoryLabel
    case '1080p60':
      return '1920×1080 @ 60 Hz'
    case '1440p30':
      return '2560×1440 @ 30 Hz'
    case '1620p30':
      return '2880×1620 @ 30 Hz'
    case '720p90':
      return '1280×720 @ 90 Hz'
    case '720p120':
      return '1280×720 @ 120 Hz'
    default:
      return id
  }
}

export function edidCurrentSummary(status: EDIDStatus | null, unknownLabel: string) {
  const preferred = status?.summary?.preferred
  if (!preferred) return unknownLabel
  return `${preferred.width}×${preferred.height} @ ${preferred.fps} Hz`
}

export function edidSelectOptions(
  status: EDIDStatus | null,
  labels: { factory: string; presets: string; custom: string },
): EdidSelectOption[] {
  const directories = status?.directories || []
  const presets = directories.filter((directory) => directory.role === 'preset').flatMap((directory) =>
    directory.files.map((file) => ({
      label: machinePresetLabel(file.id, labels.factory),
      value: encodeEdidSelection({ extension: directory.extension, directory: directory.id, id: file.id }),
    })),
  )
  const custom = directories.filter((directory) => directory.role === 'custom').flatMap((directory) =>
    directory.files.map((file) => ({
      label: `${file.id}.edid.bin`,
      value: encodeEdidSelection({ extension: directory.extension, directory: directory.id, id: file.id }),
    })),
  )
  const groups: EdidSelectOption[] = []
  if (presets.length) {
    groups.push({ type: 'group', label: labels.presets, key: 'machine', children: presets })
  }
  if (custom.length) {
    groups.push({ type: 'group', label: labels.custom, key: 'custom', children: custom })
  }
  return groups
}

export function edidRequiresRestart(policy: string | undefined) {
  return policy === 'reboot' || policy === 'power_cycle'
}

export function supportsHdmiReset(status: EDIDStatus | null) {
  return status?.supported === true
    && status.writable === true
    && status.hotplug === true
    && !edidRequiresRestart(status.apply_policy)
}
