<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'

const props = defineProps<{ show: boolean }>()
const mounted = shallowRef(false)
const content = shallowRef<HTMLElement | null>(null)
const height = shallowRef(0)
let observer: ResizeObserver | undefined
let frame = 0
let generation = 0

// Retain the form after its first visit. Observe the content rather than the
// animated wrapper so loading and scan results can resize without snapping.
watch(() => props.show, async (show) => {
  const current = ++generation
  cancelAnimationFrame(frame)
  if (!show) { height.value = 0; return }
  mounted.value = true
  await nextTick()
  if (current !== generation || !content.value) return
  if (!observer) {
    observer = new ResizeObserver(() => {
      if (props.show && content.value) height.value = content.value.getBoundingClientRect().height
    })
    observer.observe(content.value)
  }
  frame = requestAnimationFrame(() => {
    if (current === generation && content.value) height.value = content.value.getBoundingClientRect().height
  })
}, { immediate: true })

onBeforeUnmount(() => { generation++; cancelAnimationFrame(frame); observer?.disconnect() })
</script>

<template>
  <div class="expandable-panel" :style="{ height: `${height}px` }" :inert="!show" :aria-hidden="!show">
    <div v-if="mounted" ref="content" class="expandable-panel-content"><slot /></div>
  </div>
</template>

<style scoped>
.expandable-panel { overflow: hidden; transition: height 220ms cubic-bezier(0.23, 1, 0.32, 1); }
.expandable-panel-content { display: flow-root; }
@media (prefers-reduced-motion: reduce) { .expandable-panel { transition: none; } }
</style>
