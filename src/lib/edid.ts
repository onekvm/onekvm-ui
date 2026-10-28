import type { EDIDStatus } from '@/api/client'

export type EdidLibraryRef = { extension: string; directory: string; id: string }

export type EdidSelectOption =
  | { type: 'group'; label: string; key: string; children: Array<{ label: string; value: string; search?: string }> }

export const EDID_ASPECT_RATIOS = ['1:1', '5:4', '4:3', '3:2', '16:10', '16:9', '17:9', '21:9', '32:9', '9:16'] as const

const LEGACY_MODES: Record<string, [number, number, number]> = {
  '720p60': [1280, 720, 60], '720p90': [1280, 720, 90], '720p120': [1280, 720, 120],
  '1080p60': [1920, 1080, 60], '1080p120': [1920, 1080, 120],
  '1440p30': [2560, 1440, 30], '1440p60': [2560, 1440, 60],
  '1620p30': [2880, 1620, 30], '2160p30': [3840, 2160, 30],
}

export function edidPresetMode(id: string): [number, number, number] | undefined {
  const match = /^(\d{3,4})x(\d{3,4})p(\d{2,3})$/.exec(id)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : LEGACY_MODES[id]
}

// Common names are aliases of existing files; dimensions keep “2K” unambiguous.
export function edidPresetAliases(mode: [number, number, number] | undefined): string[] {
  if (!mode) return []
  return ({
    '640x480': ['480p', 'VGA'], '854x480': ['480p', 'FWVGA'],
    '1280x720': ['720p', 'HD'], '1920x1080': ['1080p', 'FHD'],
    '2560x1440': ['2K', 'QHD', '1440p'], '3840x2160': ['4K', 'UHD', '2160p'],
  } as Record<string, string[]>)[`${mode[0]}x${mode[1]}`] || []
}

export function edidAspectRatio(width: number, height: number) {
  return EDID_ASPECT_RATIOS.find((aspect) => {
    const [w, h] = aspect.split(':').map(Number)
    // Include nominal DCI 17:9, ultrawide 21:9 and 854x480 formats.
    return Math.abs((width / height) / (w! / h!) - 1) < 0.02
  })
}

export function filterEdidOption(pattern: string, option: { label?: unknown; search?: unknown }) {
  const normalize = (value: string) => value.toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, '')
  const text = normalize(String(option.search ?? option.label ?? ''))
  const query = pattern.replace(/\s*([x×*:])\s*/gi, '$1').replace(/(\d)\s+(hz)\b/gi, '$1$2')
  return query.trim().split(/\s+/).every((part) => text.includes(normalize(part)))
}

const SEPARATOR = '\0'

const MANUFACTURERS: Readonly<Record<string, string>> = {
  OKV: 'OneKVM', SAM: 'Samsung', LGD: 'LG Display', GSM: 'LG', DEL: 'Dell',
  HPN: 'HP', HWP: 'HP', ACR: 'Acer', ACI: 'ASUS', AUS: 'ASUS', MSI: 'MSI',
  LEN: 'Lenovo', APP: 'Apple', SNY: 'Sony', VSC: 'ViewSonic', BNQ: 'BenQ',
  AOC: 'AOC', PHL: 'Philips', SHP: 'Sharp', TSB: 'Toshiba', NEC: 'NEC',
  IVM: 'Iiyama', AUO: 'AU Optronics', BOE: 'BOE', CMN: 'Chi Mei', QDS: 'Quanta Display',
}

export function edidManufacturerLabel(manufacturer: string | undefined) {
  const id = manufacturer?.trim().toUpperCase() || ''
  if (!/^[A-Z]{3}$/.test(id)) return ''
  return MANUFACTURERS[id] ? `${MANUFACTURERS[id]} (${id})` : id
}

export function encodeEdidSelection(ref: EdidLibraryRef) {
  return `${ref.extension}${SEPARATOR}${ref.directory}${SEPARATOR}${ref.id}`
}

export function parseEdidSelection(value: string): EdidLibraryRef | null {
  const [extension, directory, id] = value.split(SEPARATOR)
  if (!extension || !directory || !id) return null
  return { extension, directory, id }
}

export function machinePresetLabel(id: string, factoryLabel: string) {
  if (id === 'factory') return factoryLabel
  const mode = edidPresetMode(id)
  return mode ? `${mode[0]}×${mode[1]} @ ${mode[2]} Hz` : id
}

export function edidCurrentSummary(status: EDIDStatus | null, unknownLabel: string) {
  const preferred = status?.summary?.preferred
  if (!preferred) return unknownLabel
  return `${preferred.width}×${preferred.height} @ ${preferred.fps} Hz`
}

export function edidSelectOptions(
  status: EDIDStatus | null,
  labels: { factory: string; presets: string; common: string; custom: string },
): EdidSelectOption[] {
  const directories = status?.directories || []
  const presets = directories.filter((directory) => directory.role === 'preset').flatMap((directory) =>
    directory.files.map((file) => {
      const mode = edidPresetMode(file.id)
      const aspect = mode ? edidAspectRatio(mode[0], mode[1]) : undefined
      const label = machinePresetLabel(file.id, labels.factory)
      const aliases = edidPresetAliases(mode)
      return { label, aspect, mode, aliases,
        search: `${label} ${file.id} ${aspect || ''} ${aliases.join(' ')} ${aliases.map((alias) => alias + mode![2]).join(' ')}`,
        value: encodeEdidSelection({ extension: directory.extension, directory: directory.id, id: file.id }) }
    }),
  )
  const custom = directories.filter((directory) => directory.role === 'custom').flatMap((directory) =>
    directory.files.map((file) => ({
      label: `${file.id}.edid.bin`,
      value: encodeEdidSelection({ extension: directory.extension, directory: directory.id, id: file.id }),
    })),
  )
  const groups: EdidSelectOption[] = []
  const common = presets.filter((option) => option.aliases.length).sort((a, b) =>
    b.mode![1] - a.mode![1] || b.mode![0] - a.mode![0] || b.mode![2] - a.mode![2]).map((option) => ({
      ...option, label: `${option.aliases.join(' / ')} · ${option.label}`,
      // NSelect requires unique values. Parsing still resolves the same library file.
      value: `${option.value}${SEPARATOR}common`,
    }))
  if (common.length) groups.push({ type: 'group', label: labels.common, key: 'common', children: common })
  const other = presets.filter((option) => !option.aspect)
  if (other.length) {
    groups.push({ type: 'group', label: labels.presets, key: 'machine', children: other })
  }
  for (const aspect of EDID_ASPECT_RATIOS) {
    const children = presets.filter((option) => option.aspect === aspect).sort((a, b) =>
      a.mode![1] - b.mode![1] || a.mode![0] - b.mode![0] || a.mode![2] - b.mode![2])
    if (children.length) groups.push({ type: 'group', label: aspect, key: `machine:${aspect}`, children })
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

// Legacy-only backends retain their existing write action. Temporary requests
// must always remain explicit, even if capabilities disappear between reads.
export function edidWriteMode(status: EDIDStatus | null | undefined, mode: 'permanent' | 'temporary') {
  if (mode === 'temporary') return mode
  return status?.write_modes?.permanent ? mode : undefined
}
