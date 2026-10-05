export const SHELL_METHOD_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/

export function assertShellRegistrationId(id: string, expected: string | null) {
  if (!expected) {
    throw new Error('Extension shell registration is only allowed while the host is loading that extension')
  }
  if (id !== expected) {
    throw new Error(`Extension shell ID ${id} does not match ${expected}`)
  }
}

export function assertShellMethods(methods: Record<string, unknown>) {
  const entries = Object.entries(methods || {})
  if (entries.length === 0) throw new Error('Extension shell must register at least one method')
  for (const [name, handler] of entries) {
    if (!SHELL_METHOD_PATTERN.test(name)) throw new Error(`Invalid extension shell method ${name}`)
    if (typeof handler !== 'function') throw new Error(`Extension shell method ${name} must be a function`)
  }
}
