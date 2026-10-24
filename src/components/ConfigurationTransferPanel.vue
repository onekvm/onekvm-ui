<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NModal, useMessage } from 'naive-ui'
import { Download, FileUp } from '@/icons'
import { api, APIError, type ConfigImportPreview, type ConfigSaveResponse } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean; videoSessionId: string }>()
const emit = defineEmits<{ applied: [response: ConfigSaveResponse] }>()
const message = useMessage()
type Phase = 'idle' | 'exporting' | 'reading' | 'validating' | 'applying'
const phase = ref<Phase>('idle')
const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const text = ref('')
const filename = ref('')
const error = ref('')
const preview = ref<ConfigImportPreview | null>(null)
const busy = computed(() => phase.value !== 'idle')
const locked = computed(() => busy.value || props.disabled)
const tr = (key: string) => t(`settings.configTransfer.${key}`)
const checkedSummary = computed(() => tr('checked').replace('{{count}}', String(preview.value?.commands ?? 0)))

watch(text, () => { preview.value = null; error.value = '' }, { flush: 'sync' })

function startImport() {
  if (locked.value) return
  text.value = ''
  filename.value = ''
  preview.value = null
  error.value = ''
  open.value = true
}

async function exportConfig() {
  if (locked.value) return
  phase.value = 'exporting'
  try {
    const result = await api.exportConfig()
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `onekvm-config-${new Date().toISOString().replace(/[:.]/g, '-')}.conf`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally { phase.value = 'idle' }
}

async function readFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || locked.value) return
  preview.value = null
  error.value = ''
  phase.value = 'reading'
  text.value = ''
  filename.value = ''
  try {
    if (file.size > 1024 * 1024) throw new Error(tr('tooLarge'))
    text.value = await file.text()
    filename.value = file.name
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { phase.value = 'idle' }
}

async function validate() {
  if (locked.value || !text.value.trim()) return
  phase.value = 'validating'
  error.value = ''
  preview.value = null
  try {
    preview.value = await api.previewConfigImport(text.value, props.videoSessionId)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { phase.value = 'idle' }
}

async function apply() {
  const checked = preview.value
  if (locked.value || !checked?.has_changes) return
  phase.value = 'applying'
  error.value = ''
  try {
    const response = await api.importConfig(text.value, checked.revision, props.videoSessionId)
    open.value = false
    emit('applied', response)
    if (!response.network_apply?.pending) message.success(tr('success'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
    // A stale preview must be checked again before another commit.
    if (reason instanceof APIError && reason.status === 409) preview.value = null
    if (!(reason instanceof APIError) && checked.network_changed) {
      const status = await api.getNetworkApplyStatus().catch(() => null)
      if (status?.pending) {
        open.value = false
        emit('applied', { status: 'confirmation-required', network_apply: status })
      }
    }
  } finally { phase.value = 'idle' }
}
</script>

<template>
  <section class="system-settings-group configuration-transfer">
    <h2>{{ tr('title') }}</h2>
    <p class="configuration-transfer-description">{{ tr('description') }}</p>
    <div class="configuration-transfer-actions">
      <n-button secondary :loading="phase === 'exporting'" :disabled="locked" @click="exportConfig">
        <template #icon><Download /></template>{{ tr('export') }}
      </n-button>
      <n-button secondary :disabled="locked" @click="startImport">
        <template #icon><FileUp /></template>{{ tr('import') }}
      </n-button>
    </div>
    <n-modal
      v-model:show="open" preset="card" :title="tr('import')"
      class="configuration-import-dialog" :style="{ width: 'min(720px, calc(100vw - 32px))' }"
      :closable="!busy" :mask-closable="!busy" :close-on-esc="!busy" :auto-focus="false"
    >
      <div class="configuration-import-content">
        <n-alert type="info" :bordered="false">{{ tr('scope') }}</n-alert>
        <div class="configuration-transfer-actions">
          <input ref="fileInput" type="file" accept=".conf,.txt,.set,text/plain" hidden @change="readFile" />
          <n-button :disabled="locked" :loading="phase === 'reading'" @click="fileInput?.click()">
            <template #icon><FileUp /></template>{{ tr('chooseFile') }}
          </n-button>
          <span class="configuration-import-filename">{{ filename }}</span>
        </div>
        <n-input
          v-model:value="text" type="textarea" :disabled="locked" :placeholder="tr('placeholder')"
          :input-props="{ 'aria-label': tr('configurationText'), spellcheck: false }"
          :autosize="{ minRows: 7, maxRows: 12 }" class="configuration-import-source"
        />
        <n-alert v-if="error" type="error" :bordered="false" role="alert">{{ error }}</n-alert>
        <template v-if="preview">
          <p class="configuration-import-summary">
            {{ checkedSummary }}
            <span>{{ preview.sections.join(' · ') }}</span>
          </p>
          <n-alert v-if="preview.network_changed" type="warning" :bordered="false">{{ tr('networkWarning') }}</n-alert>
          <pre v-if="preview.has_changes" class="configuration-import-diff" tabindex="0" :aria-label="tr('changes')">{{ preview.diff }}</pre>
          <n-alert v-else type="success" :bordered="false">{{ tr('noChanges') }}</n-alert>
        </template>
      </div>
      <template #footer>
        <div class="configuration-import-footer">
          <n-button :disabled="busy" @click="open = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button v-if="!preview" type="primary" :disabled="locked || !text.trim()" :loading="phase === 'validating'" @click="validate">{{ tr('preview') }}</n-button>
          <n-button v-else type="primary" :disabled="locked || !preview.has_changes" :loading="phase === 'applying'" @click="apply">{{ tr('apply') }}</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.configuration-transfer-description { color: var(--muted-foreground); margin: 0; line-height: 1.6; }
.configuration-transfer-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.configuration-import-content { display: flex; flex-direction: column; gap: 16px; }
.configuration-import-filename { overflow-wrap: anywhere; color: var(--muted-foreground); min-width: 0; }
.configuration-import-source :deep(textarea), .configuration-import-diff { font-family: var(--font-mono, monospace); font-size: 12px; }
.configuration-import-summary { margin: 0; }
.configuration-import-summary span { display: block; color: var(--muted-foreground); margin-top: 4px; overflow-wrap: anywhere; }
.configuration-import-diff { margin: 0; padding: 12px; max-height: 260px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.configuration-import-footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
</style>
