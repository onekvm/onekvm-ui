import { inject, provide, readonly, shallowRef, watch, type InjectionKey } from 'vue'

const STORAGE_KEY = 'onekvm-performance-docked'

function createPerformanceDock() {
  const docked = shallowRef(localStorage.getItem(STORAGE_KEY) === 'true')
  const visible = shallowRef(false)
  const dragging = shallowRef(false)
  const preview = shallowRef(false)
  const target = shallowRef<HTMLElement | null>(null)
  const toolbar = shallowRef<HTMLElement | null>(null)
  watch(docked, value => localStorage.setItem(STORAGE_KEY, String(value)))

  function updateDrag(point: { x: number; y: number } | null) {
    dragging.value = point !== null
    const rect = toolbar.value?.getBoundingClientRect()
    preview.value = Boolean(point && rect && rect.width && rect.height
      && point.x >= rect.left && point.x <= rect.right
      && point.y >= rect.top && point.y <= rect.bottom)
  }

  return {
    docked: readonly(docked), visible: readonly(visible),
    dragging: readonly(dragging), preview: readonly(preview), target: readonly(target),
    setDocked(value: boolean) { docked.value = value },
    setVisible(value: boolean) { visible.value = value },
    register(element: HTMLElement | null, bar: HTMLElement | null) {
      target.value = element
      toolbar.value = bar
    },
    updateDrag,
  }
}

const key: InjectionKey<ReturnType<typeof createPerformanceDock>> = Symbol('performance-dock')

export function providePerformanceDock() {
  const dock = createPerformanceDock()
  provide(key, dock)
  return dock
}

export function usePerformanceDock() {
  const dock = inject(key)
  if (!dock) throw new Error('Performance dock requires AppShell')
  return dock
}
