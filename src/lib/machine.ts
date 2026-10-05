export type MachineIdentity = {
  vendor?: string
  name?: string
  machine?: string
  variant?: string
}

function formatVariant(variant?: string): string {
  if (!variant) return ''
  const normalized = variant.toLowerCase()
  if (normalized === 'pcie' || normalized === 'atx') return 'PCIe'
  if (normalized === 'cube') return 'Cube'
  if (normalized === 'desk') return 'Desk'
  return variant
}

export function machineDisplayName(identity: MachineIdentity | null | undefined): string {
  const name = identity?.name?.trim()
  const vendor = identity?.vendor?.trim()
  const machine = identity?.machine?.trim()
  let label = name || machine || '-'
  if (vendor && name && !name.toLowerCase().startsWith(vendor.toLowerCase())) {
    label = `${vendor} ${name}`
  }
  const variant = formatVariant(identity?.variant)
  return variant ? `${label} ${variant}` : label
}
