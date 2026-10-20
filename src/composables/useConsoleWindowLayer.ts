import { computed, shallowRef } from 'vue'
import { createConsoleWindowStack } from '@/lib/console-window-stack'

const revision = shallowRef(0)
const stack = createConsoleWindowStack(() => { revision.value++ })

export function registerConsoleWindowLayer() {
  const group = stack.register()
  return {
    layer: computed(() => { revision.value; return group.layer() }),
    active: computed(() => { revision.value; return group.active() }),
    raise: group.raise,
    reserve: group.reserve,
    dispose: group.dispose,
  }
}
