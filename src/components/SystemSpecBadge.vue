<script setup lang="ts">
import { computed, shallowRef } from 'vue'

defineProps<{
  value: string
  label: string
  description: string
}>()

const hovered = shallowRef(false)
const focused = shallowRef(false)
const show = computed(() => hovered.value || focused.value)
</script>

<template>
  <n-tooltip trigger="manual" :show="show" placement="top">
    <template #trigger>
      <button
        type="button"
        class="system-spec-badge"
        :aria-label="`${label}: ${value}. ${description}`"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @focus="focused = true"
        @blur="focused = false"
      >{{ value }}</button>
    </template>
    <strong>{{ label }}: {{ value }}</strong><br />{{ description }}
  </n-tooltip>
</template>
