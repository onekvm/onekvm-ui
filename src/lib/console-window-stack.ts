// Above the console controls, below control sheets (1800) and Naive UI overlays (2000+).
export const CONSOLE_WINDOW_LAYER = 1000

/** Order floating window groups while reserving space for their owned windows. */
export function createConsoleWindowStack(changed: () => void = () => {}) {
  const groups = new Map<symbol, number>()
  let order: symbol[] = []
  return {
    register() {
      const id = Symbol('console-window')
      groups.set(id, 1)
      order.push(id)
      changed()
      return {
        layer() {
          let layer = CONSOLE_WINDOW_LAYER
          for (const group of order) {
            if (group === id) return layer
            layer += groups.get(group)! * 2
          }
          return layer
        },
        active: () => order.at(-1) === id,
        raise() {
          if (!groups.has(id) || order.at(-1) === id) return
          order = [...order.filter(group => group !== id), id]
          changed()
        },
        reserve(windows: number) {
          if (!Number.isInteger(windows) || windows < 1) throw new Error('Invalid window count')
          if (!groups.has(id) || groups.get(id) === windows) return
          groups.set(id, windows)
          changed()
        },
        dispose() {
          if (!groups.delete(id)) return
          order = order.filter(group => group !== id)
          changed()
        },
      }
    },
  }
}
