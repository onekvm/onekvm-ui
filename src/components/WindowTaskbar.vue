<script setup lang="ts">
import { h, onBeforeUnmount, shallowRef, watch, type FunctionalComponent, type VNodeChild } from 'vue'
import { AppWindow } from '@/icons'
import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { setWindowTaskbarInset, useWindowTaskbar } from '@/composables/useWindowTaskbar'

const tasks = useWindowTaskbar()
const bar = shallowRef<HTMLElement | null>(null)
let observer: ResizeObserver | undefined
watch(bar, element => {
  observer?.disconnect()
  if (!element) { setWindowTaskbarInset(0); return }
  const measure = () => setWindowTaskbarInset(element.getBoundingClientRect().height)
  observer = new ResizeObserver(measure)
  observer.observe(element)
  measure()
}, { flush: 'post' })
onBeforeUnmount(() => { observer?.disconnect(); setWindowTaskbarInset(0) })
const mountTo = useOverlayMount()
const TaskIcon: FunctionalComponent<{ render?: () => VNodeChild }> = props => props.render?.() || h(AppWindow, { size: 18 })
</script>
<template>
  <Teleport :to="mountTo">
    <Transition name="window-taskbar">
      <nav v-if="tasks.length" ref="bar" class="window-taskbar" :aria-label="t('taskbar.title')" data-toolbox-local
        @pointerdown.stop @pointerup.stop @keydown.stop @keyup.stop @wheel.stop>
        <button v-for="task in tasks" :key="task.id" type="button" class="window-task"
          :data-window-task="task.id" :data-transfer-task="task.transferId"
          :aria-label="t('taskbar.restore').replace('{name}', task.title)" :title="task.title"
          @click="task.restore">
          <span class="window-task-icon" aria-hidden="true"><TaskIcon :render="task.icon" /></span>
          <span class="window-task-title">{{ task.title }}</span>
          <span v-if="task.progress !== undefined" class="window-task-progress" aria-hidden="true">{{ task.progress }}%</span>
        </button>
      </nav>
    </Transition>
  </Teleport>
</template>
<style scoped>
.window-taskbar { position: fixed; inset: auto 0 0; z-index: 1790; display: flex; gap: 6px; align-items: center; min-height: 48px; padding: 4px max(8px, env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); box-sizing: border-box; overflow-x: auto; border-top: 1px solid var(--border-strong); background: var(--onekvm-surface-overlay); color: var(--foreground); box-shadow: var(--onekvm-shadow-panel); pointer-events: auto; }
.window-task { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: flex-start; gap: 8px; min-height: 38px; max-width: 240px; padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-small, 6px); background: var(--secondary); color: inherit; font: inherit; cursor: pointer; }
.window-task:hover { background: var(--secondary-hover); border-color: var(--border-strong); }
.window-task:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.window-task-icon { display: inline-flex; flex: none; width: 18px; height: 18px; align-items: center; justify-content: center; }
.window-task-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.window-task-progress { color: var(--muted-foreground); font-size: 11px; font-variant-numeric: tabular-nums; }
.window-taskbar-enter-active, .window-taskbar-leave-active { transition: transform 160ms ease, opacity 160ms ease; }
.window-taskbar-enter-from, .window-taskbar-leave-to { transform: translateY(100%); opacity: 0; }
@media (pointer: coarse), (max-width: 600px) { .window-task { min-height: 44px; max-width: min(220px, 75vw); } }
@media (prefers-reduced-motion: reduce) { .window-taskbar-enter-active, .window-taskbar-leave-active { transition: none; } }
</style>
