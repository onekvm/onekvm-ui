import type { VNodeChild } from 'vue'

export interface WindowTask {
  id: string
  title: string
  icon?: () => VNodeChild
  progress?: number
  transferId?: 'files' | 'media'
  restore: () => void
}

/** Stable ordering while labels/progress update; each mounted window owns its entry. */
export function createWindowTasks(changed: (tasks: WindowTask[]) => void) {
  const tasks = new Map<string, WindowTask>()
  let sequence = 0
  return {
    register() {
      const id = `window-task-${++sequence}`
      let disposed = false
      return {
        id,
        update(task: Omit<WindowTask, 'id'> | null) {
          if (disposed) return
          if (task) tasks.set(id, { ...task, id })
          else if (!tasks.delete(id)) return
          changed([...tasks.values()])
        },
        dispose() {
          disposed = true
          if (tasks.delete(id)) changed([...tasks.values()])
        },
      }
    },
  }
}
