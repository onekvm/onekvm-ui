<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { NButton, useMessage, useThemeVars } from 'naive-ui'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import type { HIDRecordingActivity } from '@/extensions/toolboxRuntime'
const props = defineProps<{ owner: string | null | undefined; recording?: HIDRecordingActivity | null }>()
const mountTo = useOverlayMount()
const pending = shallowRef(false)
const message = useMessage()
const theme = useThemeVars()
const progress = shallowRef<{ filename?: string; current_line?: number; total_lines?: number } | null>(null)
let timer = 0
function stopPoll() { window.clearTimeout(timer); timer = 0 }
async function poll() {
  stopPoll()
  const owner = props.owner
  if (!owner) { progress.value = null; return }
  try {
    const status = await api.invokeExtension<{ filename?: string; current_line?: number; total_lines?: number }>(owner, 'run_status')
    if (props.owner === owner) progress.value = status
  } catch { if (props.owner === owner) progress.value = null }
  if (props.owner) timer = window.setTimeout(poll, 400)
}
watch(() => props.owner, () => { void poll() }, { immediate: true })
onBeforeUnmount(stopPoll)
const ringLength = 2 * Math.PI * 12
const ringOffset = computed(() => {
  const total = progress.value?.total_lines || 0
  const current = Math.min(total, Math.max(0, progress.value?.current_line || 0))
  return ringLength * (1 - (total > 0 ? current / total : 0))
})
const lineText = computed(() => {
  if (!props.owner && props.recording) {
    const stats = props.recording.stats.value
    return t('toolbox.recordingCount', '{total} reports · {kept} HID actions')
      .replace('{total}', String(stats.receivedReports))
      .replace('{kept}', String(stats.writtenActions))
  }
  const status = progress.value
  const total = status?.total_lines || 0
  if (!total) return ''
  const current = status?.current_line || 0
  const line = t('toolbox.macroLine', 'Line {current} / {total}')
    .replace('{current}', String(current))
    .replace('{total}', String(total))
  return status?.filename ? `${status.filename} · ${line}` : line
})
async function stop() {
  if (pending.value) return
  if (!props.owner) { props.recording?.stop(); return }
  pending.value = true
  try { await api.invokeExtension(props.owner, 'stop_run', {}) }
  catch (error) { message.error(error instanceof Error ? error.message : String(error)) }
  finally { pending.value = false }
}
</script>
<template>
  <Teleport :to="mountTo">
    <div class="macro-run-banner-anchor">
      <Transition name="win11-window">
        <div v-if="owner || recording" class="macro-run-banner" :class="{ 'is-recording': !owner && recording }" :style="{ background: theme.popoverColor, color: theme.textColor1, borderColor: theme.borderColor }" data-toolbox-local role="status">
          <svg class="macro-run-ring" viewBox="0 0 32 32" aria-hidden="true">
            <circle class="macro-run-ring-track" cx="16" cy="16" r="12" />
            <circle v-if="owner" class="macro-run-ring-value" cx="16" cy="16" r="12" :stroke-dasharray="ringLength" :stroke-dashoffset="ringOffset" />
            <circle v-else class="macro-record-dot" cx="16" cy="16" r="6" />
          </svg>
          <div class="macro-run-copy">
            <span>{{ t(owner ? 'toolbox.macroExclusive' : 'toolbox.macroRecording') }}</span>
            <small v-if="lineText">{{ lineText }}</small>
          </div>
          <NButton size="small" type="error" secondary :loading="pending" @click="stop">{{ t(owner ? 'toolbox.stopMacro' : 'toolbox.stopRecording') }}</NButton>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
<style scoped>
.macro-run-banner-anchor { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 12px); left: 50%; z-index: 2500; transform: translateX(-50%); pointer-events: none; }
.macro-run-banner { max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-large); background: var(--onekvm-surface-overlay); color: var(--foreground); box-shadow: var(--onekvm-shadow-panel); pointer-events: auto; }
.macro-run-banner.win11-window-leave-active { pointer-events: none; }
.macro-run-ring { width: 28px; height: 28px; flex: none; transform: rotate(-90deg); }
.macro-run-ring circle { fill: none; stroke-width: 3; }
.macro-run-ring-track { stroke: var(--border-strong, var(--border)); }
.macro-run-ring-value { stroke: var(--primary); stroke-linecap: round; transition: stroke-dashoffset 200ms linear; }
.macro-run-ring .macro-record-dot { fill: var(--destructive); stroke: none; }
.macro-run-banner :deep(.n-button) { flex-shrink: 0; }
.macro-run-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.macro-run-copy span { line-height: 1.3; }
.macro-run-copy small { overflow: hidden; color: var(--onekvm-text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
@media (pointer: coarse) { .macro-run-banner :deep(button) { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .macro-run-ring-value { transition: none; } }
</style>
