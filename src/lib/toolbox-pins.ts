export interface ToolboxPin { toolId: string; order: number }
const validToolId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,62}\/[a-z0-9][a-z0-9-]{1,62}$/.test(id)

export function reorderToolboxPins(pins: ToolboxPin[], sourceId: string, targetId: string): ToolboxPin[] {
  const ordered = [...pins].sort((a, b) => a.order - b.order || a.toolId.localeCompare(b.toolId))
  const source = ordered.findIndex(pin => pin.toolId === sourceId)
  const target = ordered.findIndex(pin => pin.toolId === targetId)
  if (source < 0 || target < 0 || source === target) return pins
  const [moved] = ordered.splice(source, 1)
  ordered.splice(target, 0, moved!)
  return ordered.map((pin, index) => ({ toolId: pin.toolId, order: index + 1 }))
}

export function parseToolboxPins(raw: string | null): ToolboxPin[] {
  try {
    const value = JSON.parse(raw || 'null')
    if (![1, 2].includes(value?.schemaVersion) || !Array.isArray(value.items)) return []
    const seen = new Set<string>()
    return value.items.slice(0, 256).filter((pin: ToolboxPin) => {
      if (!pin || !validToolId(pin.toolId) || seen.has(pin.toolId) || !Number.isSafeInteger(pin.order)) return false
      seen.add(pin.toolId)
      return true
    }).map((pin: ToolboxPin) => ({ toolId: pin.toolId, order: pin.order }))
  } catch { return [] }
}

export function toolboxPinStorageKey(origin: string, username: string) {
  return `onekvm:toolbox-pins:v1:${encodeURIComponent(origin)}:${encodeURIComponent(username)}`
}
