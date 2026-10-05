<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { type DropdownOption } from 'naive-ui'
import { Ellipsis, Pin } from '@lucide/vue'
import { useToolboxContext } from '@/composables/useToolbox'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import { t } from '@/i18n/runtime'
import ToolIcon from './ToolIcon.vue'

const props = defineProps<{ mobile?: boolean; vertical?: boolean; placement?: 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start' }>()
const emit = defineEmits<{ overlay: [open: boolean] }>()
const toolbox = useToolboxContext()
const mountTo = useOverlayMount()
const overflowOpen = ref(false)
const visible = computed(() => toolbox.pinned.slice(0, props.mobile ? 8 : props.vertical ? 2 : 3))
const overflow = computed(() => toolbox.pinned.slice(visible.value.length))
const menuProps = () => ({ style: { maxHeight: 'calc(100dvh - 24px)' }, 'data-toolbox-local': '' })
const overflowOptions = computed<DropdownOption[]>(() => overflow.value.map(({ tool }) => ({ key: tool.id, label: tool.title, icon: () => h(ToolIcon, { tool, loading: toolbox.openingIds.includes(tool.id) }) })))
function dismiss() { overflowOpen.value = false }
watch(overflowOpen, open => emit('overlay', open))
onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss))
onBeforeUnmount(() => { window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss); emit('overlay', false) })
</script>
<template>
  <div v-if="toolbox.pinned.length" class="toolbar-pinned-tools" :class="{ 'is-mobile': mobile, 'is-vertical': vertical }" role="group" :aria-label="t('toolbox.pinned')" data-toolbox-local>
    <span v-if="mobile" class="toolbar-pinned-heading"><Pin :size="14" />{{ t('toolbox.pinned') }}</span>
    <div class="toolbar-pinned-buttons">
      <n-tooltip v-for="{ tool } in visible" :key="tool.id" :to="mountTo" :disabled="mobile" :placement="placement?.startsWith('left') ? 'left' : placement?.startsWith('right') ? 'right' : placement?.startsWith('top') ? 'top' : 'bottom'" style="pointer-events: none">
        <template #trigger>
          <n-button quaternary size="small" class="toolbar-pin-button" :class="{ 'is-open': toolbox.instances.some(instance => instance.id === tool.id) }" :aria-label="tool.title" :aria-pressed="toolbox.instances.some(instance => instance.id === tool.id)" :aria-busy="toolbox.openingIds.includes(tool.id)" @click="toolbox.open(tool.id, $event.currentTarget as HTMLElement)">
            <template #icon><ToolIcon :tool="tool" :loading="toolbox.openingIds.includes(tool.id)" /></template>
            <span v-if="mobile">{{ tool.title }}</span>
          </n-button>
        </template>
        {{ tool.title }}
      </n-tooltip>
      <n-dropdown v-if="overflow.length" trigger="click" :show="overflowOpen" :options="overflowOptions" :to="mountTo" :placement="placement || 'bottom-end'" scrollable :menu-props="menuProps" @update:show="overflowOpen = $event" @select="toolbox.open(String($event)); overflowOpen = false">
        <n-button quaternary size="small" :aria-label="`${t('toolbox.morePins')} (${overflow.length})`"><template #icon><Ellipsis :size="16" /></template><span v-if="mobile">{{ t('toolbox.morePins') }}</span></n-button>
      </n-dropdown>
    </div>
  </div>
</template>
<style scoped>
.toolbar-pinned-tools { display: flex; align-items: center; flex-shrink: 0; padding-left: 7px; margin-left: 4px; border-left: 1px solid var(--border); }
.toolbar-pinned-buttons { display: flex; align-items: center; gap: 4px; }
.toolbar-pinned-tools:not(.is-mobile) :deep(.n-button) { width: 30px; height: 30px; min-width: 30px; padding: 0; }
.toolbar-pinned-tools:not(.is-mobile) :deep(.n-button__icon) { margin: 0; }
.toolbar-pin-button.is-open { color: var(--primary); background: var(--accent); }
.toolbar-pinned-tools :deep(button:focus-visible) { outline: 2px solid var(--ring); outline-offset: -2px; }
.toolbar-pinned-tools.is-vertical { width: 100%; padding: 7px 0 0; margin: 0; border-left: 0; border-top: 1px solid var(--border); }
.is-vertical .toolbar-pinned-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; justify-items: center; }
.toolbar-pinned-tools.is-mobile { display: grid; width: 100%; padding: 8px 0; margin: 0; border-left: 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); gap: 4px; }
.toolbar-pinned-heading { display: flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 12px; color: var(--onekvm-text-tertiary); }
.is-mobile .toolbar-pinned-buttons { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); }
</style>
