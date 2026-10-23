import { onScopeDispose, shallowReadonly, shallowRef, watch } from 'vue'
import { createWindowTasks, type WindowTask } from '@/lib/window-tasks'

const tasks = shallowRef<WindowTask[]>([])
const inset = shallowRef(0)
export const useWindowTaskbarInset = () => shallowReadonly(inset)
export function setWindowTaskbarInset(height: number) { inset.value = tasks.value.length ? Math.max(0, height) : 0 }
const registry = createWindowTasks(next => {
  tasks.value = next
  if (!next.length) setWindowTaskbarInset(0)
})
export const useWindowTaskbar = () => shallowReadonly(tasks)

export function useMinimizedWindowTask(source: () => Omit<WindowTask, 'id'> | null) {
  const registration = registry.register()
  watch(source, registration.update, { immediate: true, flush: 'sync' })
  onScopeDispose(registration.dispose)
  return registration.id
}
