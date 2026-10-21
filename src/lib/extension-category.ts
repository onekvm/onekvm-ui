// OpenVPN is an environment at runtime, but belongs in the network category.
export function extensionCategory(extension?: { id: string; kind?: string }) {
  return extension?.id === 'openvpn' ? 'network' : extension?.kind || ''
}
