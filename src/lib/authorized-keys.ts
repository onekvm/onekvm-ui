export function splitAuthorizedKeyLines(value: string): string[] {
  if (!value) return []
  const keys: string[] = []
  const seen = new Set<string>()
  for (const line of value.split(/\r?\n/)) {
    const key = line.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

export function splitAuthorizedKeyList(values: readonly string[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    for (const key of splitAuthorizedKeyLines(value)) {
      if (seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}
