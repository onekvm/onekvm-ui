// OpenVPN is an environment at runtime, but belongs in the network category.
export function extensionCategory(extension?: { id: string; kind?: string }) {
  return extension?.id === 'openvpn' ? 'network' : extension?.kind || ''
}

/** System registrations and device backends provide their capabilities instead of requesting them. */
export function providesCapabilities(extension: { system?: boolean; kind?: string }) {
  return Boolean(extension.system) || extension.kind === 'device'
}
