const HOST_PREFIX = /^(?:onekvm-extension-host|onekvm-extension):\s+/

export function extensionHostErrorText(
  raw: string,
  translate: (path: string, fallback: string) => string,
  pluginName: (id: string) => string = (id) => id,
): string {
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim().replace(HOST_PREFIX, '')
    const transient = text.match(/^StartTransientUnit failed \((-?\d+)\)$/)
    if (transient) {
      return fill(translate(
        'settings.plugins.startRejected',
        'The plugin could not be started. The system rejected the service setup (error {code}).',
      ), { code: transient[1] })
    }
    const exited = text.match(/^extension ([a-z0-9][a-z0-9-]{1,62}) exited during startup$/)
    if (exited) {
      return fill(translate(
        'settings.plugins.exitedDuringStartup',
        '{name} exited immediately after starting and is not running.',
      ), { name: pluginName(exited[1]) })
    }
  }
  return raw
}

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [name, value]) => result.split(`{${name}}`).join(value),
    template,
  )
}
