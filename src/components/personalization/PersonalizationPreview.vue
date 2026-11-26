<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { GripVertical } from '@/icons'
import { type PersonalizationConfig } from '@/api/client'
import { serviceURL } from '@/api/service-url'
import { resolveConsoleSubtitle, resolveConsoleTitle } from '@/lib/console-title'
import { useAuth } from '@/composables/useAuth'
import ConsoleBrandCopy from '../ConsoleBrandCopy.vue'
import ToolbarLayoutPreview from '../ToolbarLayoutPreview.vue'
import { t } from '@/i18n/runtime'
const props = defineProps<{
  modelValue: PersonalizationConfig
  hostname: string
  deviceModel: string
}>()
const previewTitle = computed(() => resolveConsoleTitle(props.modelValue, props.hostname))
const previewSubtitle = computed(() => resolveConsoleSubtitle(
  props.modelValue,
  props.hostname,
  props.deviceModel,
))
const { auth } = useAuth()

// The preview keeps the real toolbar's size and shrinks as a whole to fit,
// down to half size; the rest scrolls sideways.
const MIN_SCALE = 0.5
const frame = useTemplateRef<HTMLElement>('frame')
const bar = useTemplateRef<HTMLElement>('bar')
const scale = shallowRef(1)
const size = shallowRef({ width: 0, height: 0 })
let observer: ResizeObserver | undefined
function fit() {
  const box = frame.value
  const toolbar = bar.value
  if (!box || !toolbar) return
  const available = box.clientWidth
  // Measure the content alone, then widen the toolbar to fill the frame as the real one does.
  toolbar.style.minWidth = '0px'
  const natural = toolbar.offsetWidth
  const next = natural > available ? Math.max(MIN_SCALE, available / natural) : 1
  const width = Math.max(natural, available / next)
  toolbar.style.minWidth = `${width}px`
  scale.value = next
  size.value = { width: width * next, height: toolbar.offsetHeight * next }
}
onMounted(() => {
  observer = new ResizeObserver(fit)
  if (frame.value) observer.observe(frame.value)
  if (bar.value) observer.observe(bar.value)
  fit()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
    <section class="personalization-preview" aria-live="polite">
      <span class="personalization-preview-label">{{ t('settings.advancedSettings.personalizationPage.preview', 'Preview') }}</span>
      <div ref="frame" class="personalization-preview-frame">
        <div class="personalization-preview-sizer" :style="size.width ? { width: `${size.width}px`, height: `${size.height}px` } : undefined">
          <div ref="bar" class="toolbar personalization-preview-toolbar" :style="scale < 1 ? { transform: `scale(${scale})` } : undefined">
            <div class="brand">
              <span class="brand-logo" aria-hidden="true">
                <img class="brand-mark" :src="serviceURL('/brand/onekvm-app-icon.svg')" alt="" draggable="false" />
              </span>
              <ConsoleBrandCopy
                :title="previewTitle"
                :subtitle="previewSubtitle"
              />
            </div>
            <span class="toolbar-spacer personalization-preview-spacer" aria-hidden="true">
              <span class="toolbar-handle"><GripVertical :size="14" /></span>
            </span>
            <ToolbarLayoutPreview :config="modelValue" :username="auth.username || 'admin'" />
          </div>
        </div>
      </div>
      <small>{{ t('settings.advancedSettings.personalizationPage.browserTab', 'Browser tab') }} · {{ previewTitle }} - OneKVM</small>
    </section>
</template>

<style scoped>
.personalization-preview { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--onekvm-surface-inset); }
.personalization-preview-label { color: var(--muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.personalization-preview-frame { overflow: auto hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); scrollbar-width: thin; }
.personalization-preview-sizer { overflow: hidden; }
.personalization-preview-toolbar { z-index: auto; pointer-events: none; width: max-content; height: var(--onekvm-toolbar-bar); border: 0; transform-origin: left top; }
.personalization-preview-toolbar .brand { min-width: 0; cursor: default; touch-action: auto; }
.personalization-preview-toolbar .brand-logo { cursor: default; touch-action: auto; }
.personalization-preview-spacer { min-width: 8px; cursor: default; touch-action: auto; }
.personalization-preview-spacer .toolbar-handle { cursor: default; }
.personalization-preview-devices,
.personalization-preview-actions { flex: 0 0 auto; }
.personalization-preview > small { overflow: hidden; color: var(--muted-foreground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .personalization-preview-toolbar { padding-inline: 7px; }
  .personalization-preview-toolbar :deep(.brand-copy) { display: grid; max-width: min(180px, 42vw); }
}
</style>
