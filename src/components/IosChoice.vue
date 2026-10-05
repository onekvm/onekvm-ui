<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronRight } from '@lucide/vue'

import { useOverlayMount } from '@/composables/useOverlayMount'

const props = defineProps<{
  label: string
  value: string
  options: { label: string; value: string }[]
  disabled?: boolean
  scroll?: boolean
}>()
const emit = defineEmits<{ select: [value: string] }>()
const open = ref(false)
const overlayTo = useOverlayMount()
const current = computed(() => props.options.find((option) => option.value === props.value)?.label || props.value)
const height = computed(() => props.scroll ? 'min(70vh, 560px)' : Math.min(72 + props.options.length * 52, 520))

function choose(value: string) {
  emit('select', value)
  open.value = false
}
</script>

<template>
  <div class="ios-choice">
    <button type="button" class="ios-choice-row" :disabled="disabled" @click="open = true">
      <span>{{ label }}</span>
      <ChevronRight />
      <em>{{ current }}</em>
    </button>
    <n-drawer
      :show="open"
      placement="bottom"
      :height="height"
      :to="overlayTo"
      @update:show="open = $event"
    >
      <n-drawer-content :title="label" closable>
        <div class="ios-drawer-list" :class="{ scroll }">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="ios-drawer-option"
            :class="{ selected: option.value === value }"
            @click="choose(option.value)"
          >
            <span>{{ option.label }}</span>
            <Check v-if="option.value === value" />
          </button>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.ios-choice-row,
.ios-drawer-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 17px;
  text-align: left;
}
.ios-choice-row { position: relative; flex-wrap: wrap; row-gap: 2px; padding-right: 40px; }
.ios-choice-row > span { flex: 1; font-weight: 650; }
.ios-choice-row > svg {
  position: absolute;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
}
.ios-choice-row em {
  width: 100%;
  flex: none;
  color: var(--muted-foreground);
  font-style: normal;
  font-weight: 400;
  line-height: 1.3;
  text-align: left;
}
.ios-choice-row svg { width: 18px; height: 18px; flex: none; color: var(--muted-foreground); }
.ios-drawer-list { display: grid; }
.ios-drawer-list.scroll { max-height: calc(70vh - 72px); overflow: auto; }
.ios-drawer-option { border-bottom: 1px solid var(--border); }
.ios-drawer-option span { flex: 1; }
.ios-drawer-option svg { width: 18px; height: 18px; color: var(--primary); }
.ios-drawer-option.selected { color: var(--primary); }
.ios-drawer-option:last-child { border-bottom: 0; }
</style>
