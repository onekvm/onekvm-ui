export type MachineIdentity = {
  vendor?: string
  name?: string
  machine?: string
  variant?: string
  variant_label?: string
}

export function machineDisplayName(identity: MachineIdentity | null | undefined): string {
  const name = identity?.name?.trim()
  const vendor = identity?.vendor?.trim()
  const machine = identity?.machine?.trim()
  let label = name || machine || '-'
  if (vendor && name && !name.toLowerCase().startsWith(vendor.toLowerCase())) {
    label = `${vendor} ${name}`
  }
  const variant = identity?.variant_label?.trim() || identity?.variant?.trim()
  return variant ? `${label} ${variant}` : label
}
