<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical } from '@/icons'
import { type PersonalizationConfig } from '@/api/client'
import { serviceURL } from '@/api/service-url'
import { resolveConsoleSubtitle, resolveConsoleTitle } from '@/lib/console-title'
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

</script>

<template>
    <section class="personalization-preview" aria-live="polite">
      <span class="personalization-preview-label">{{ t('settings.advancedSettings.personalizationPage.preview', 'Preview') }}</span>
      <div class="toolbar personalization-preview-toolbar">
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
        <ToolbarLayoutPreview :config="modelValue" />
      </div>
      <small>{{ t('settings.advancedSettings.personalizationPage.browserTab', 'Browser tab') }} · {{ previewTitle }} - OneKVM</small>
    </section>
</template>

<style scoped>
.personalization-preview { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--onekvm-surface-inset); }
.personalization-preview-label { color: var(--muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.personalization-preview-toolbar { z-index: auto; width: 100%; height: var(--onekvm-toolbar-bar); overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); pointer-events: none; }
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
