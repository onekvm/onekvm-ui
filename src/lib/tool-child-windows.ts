export interface ToolChildWindow {
  readonly owner?: ToolChildWindow | null
  readonly modal?: boolean
  focus: (attention: boolean) => void
  close: (force?: boolean) => Promise<boolean | void>
}

export const toolWindowOwnerKey = Symbol('tool-window-owner')

export function createToolChildWindows(changed: (ids: string[]) => void) {
  const children = new Map<string, ToolChildWindow[]>()
  const active = new Map<string, ToolChildWindow>()
  const publish = () => changed([...children].flatMap(([id, entries]) => entries.map(() => id)))
  const owned = (id: string, owner?: ToolChildWindow | null) => (children.get(id) || []).filter(child => (child.owner || null) === (owner || null))
  function ordered(id: string, owner?: ToolChildWindow | null): ToolChildWindow[] {
    return owned(id, owner).flatMap(child => [child, ...ordered(id, child)])
  }
  function blocking(id: string, owner?: ToolChildWindow | null): ToolChildWindow | undefined {
    const child = owned(id, owner).reverse().find(child => child.modal !== false)
    return child && (blocking(id, child) || child)
  }
  function remove(id: string, child: ToolChildWindow) {
    if (!children.get(id)?.includes(child)) return
    const remaining = (children.get(id) || []).filter(entry => entry !== child)
    if (remaining.length) children.set(id, remaining)
    else children.delete(id)
    if (active.get(id) === child) {
      if (child.owner && remaining.includes(child.owner)) active.set(id, child.owner)
      else active.delete(id)
    }
    publish()
  }
  async function close(id: string, owner?: ToolChildWindow | null, force = false): Promise<boolean> {
    for (const child of [...owned(id, owner)].reverse()) {
      if (!await close(id, child, force)) return false
      if (await child.close(force) === false) return false
      remove(id, child)
    }
    return true
  }
  return {
    index(id: string, child: ToolChildWindow) { return ordered(id).indexOf(child) },
    active(id: string) { return active.get(id) },
    blocked(id: string, owner?: ToolChildWindow | null) { return Boolean(blocking(id, owner)) },
    register(id: string, child: ToolChildWindow) {
      if (children.get(id)?.includes(child)) throw new Error('Window is already registered')
      if (child.owner && !children.get(id)?.includes(child.owner)) throw new Error('Window owner is not registered')
      children.set(id, [...(children.get(id) || []), child])
      active.set(id, child)
      publish()
      return () => remove(id, child)
    },
    activate(id: string, child?: ToolChildWindow) {
      if (child && !children.get(id)?.includes(child)) return
      if (child) {
        // Raise the owned subtree, preserving the owner below its children.
        children.set(id, [...children.get(id)!.filter(entry => entry !== child), child])
        active.set(id, child)
      } else active.delete(id)
      publish()
    },
    focus(id: string, attention = false, owner?: ToolChildWindow | null) {
      const child = blocking(id, owner)
      child?.focus(attention)
      return Boolean(child)
    },
    close,
    clear() { children.clear(); active.clear(); publish() },
  }
}
