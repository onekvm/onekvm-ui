<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Download, Play } from '@/icons'
import { useMessage } from 'naive-ui'
import type { FitAddon as FitAddonInstance } from '@xterm/addon-fit'
import type { Terminal as TerminalInstance } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { api, APIError, type DiagnosticsEvent } from '@/api/client'
import { t } from '@/i18n/runtime'
import { xtermTheme } from '@/lib/terminal-theme'
import { activeTheme } from '@/theme/runtime'
import { pendingDiagnostics, savePendingDiagnostics } from '@/lib/diagnostics-pending'

const show = defineModel<boolean>('show', { required: true })

type Stage = 'idle' | 'running' | 'done' | 'error'

const stage = ref<Stage>('idle')
const errorMessage = ref('')
const archiveId = ref('')
const archiveName = ref('')
const downloading = ref(false)
const terminalHost = ref<HTMLElement | null>(null)
const message = useMessage()

let terminal: TerminalInstance | null = null
let fitAddon: FitAddonInstance | null = null
let resizeObserver: ResizeObserver | null = null
let abort: AbortController | null = null
let mounted = false

async function ensureTerminal() {
  if (terminal || !terminalHost.value) return
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])
  if (!mounted || !terminalHost.value || terminal) return
  terminal = new Terminal({
    allowTransparency: false,
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.4,
    scrollback: 2000,
    theme: xtermTheme(activeTheme.value.appearance),
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalHost.value)
  fitAddon.fit()
  resizeObserver = new ResizeObserver(() => { fitAddon?.fit() })
  resizeObserver.observe(terminalHost.value)
}

function appendLine(text: string) {
  terminal?.writeln(text)
  terminal?.scrollToBottom()
}

function resetState() {
  abort?.abort()
  abort = null
  stage.value = 'idle'
  errorMessage.value = ''
  archiveId.value = ''
  archiveName.value = ''
  downloading.value = false
  terminal?.reset()
}

function updateVisibility(value: boolean) {
  if (value) {
    show.value = true
    return
  }
  if (stage.value === 'running') {
    abort?.abort()
  }
  show.value = false
}

async function startCollect(resumeId = '') {
  if (stage.value === 'running') return
  stage.value = 'running'
  errorMessage.value = ''
  archiveId.value = ''
  archiveName.value = ''
  await nextTick()
  await ensureTerminal()
  terminal?.reset()
  appendLine(t('settings.diagnostics.starting', 'Starting diagnostics collection…'))

  const controller = new AbortController()
  abort = controller
  try {
    await api.runDiagnostics((event: DiagnosticsEvent) => {
      if (event.type === 'job') {
        savePendingDiagnostics(event.id)
        return
      }
      if (event.type === 'line') {
        appendLine(event.text)
        return
      }
      if (event.type === 'done') {
        archiveId.value = event.id
        archiveName.value = event.name
        stage.value = 'done'
        savePendingDiagnostics('')
        return
      }
      if (event.type === 'error') {
        errorMessage.value = event.message
        stage.value = 'error'
        savePendingDiagnostics('')
        appendLine(event.message)
      }
    }, controller.signal, resumeId)
    if (stage.value === 'running') {
      errorMessage.value = t('settings.diagnostics.incomplete', 'Collection ended without a result')
      stage.value = 'error'
    }
  } catch (reason) {
    if (controller.signal.aborted) {
      stage.value = 'idle'
      return
    }
    if (reason instanceof APIError && reason.status === 404) savePendingDiagnostics('')
    const text = reason instanceof APIError
      ? reason.message
      : reason instanceof Error
        ? reason.message
        : String(reason)
    errorMessage.value = reason instanceof APIError && reason.status === 401
      ? t('settings.diagnostics.signInAgain', 'Your session expired. Sign in again to resume this diagnostics job.')
      : text
    stage.value = 'error'
    appendLine(text)
  } finally {
    if (abort === controller) abort = null
  }
}

async function downloadArchive() {
  if (!archiveId.value || downloading.value) return
  downloading.value = true
  try {
    await api.downloadDiagnostics(archiveId.value)
    message.success(t('settings.diagnostics.downloadStarted', 'Download started'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    downloading.value = false
  }
}

watch(() => activeTheme.value.appearance, (appearance) => {
  if (terminal) terminal.options.theme = xtermTheme(appearance)
})

watch(show, (visible) => {
  if (visible) {
    mounted = true
    resetState()
    const pending = pendingDiagnostics()
    if (pending) void startCollect(pending)
  } else {
    abort?.abort()
    abort = null
  }
}, { immediate: true })

onBeforeUnmount(() => {
  mounted = false
  abort?.abort()
  resizeObserver?.disconnect()
  terminal?.dispose()
  resizeObserver = null
  fitAddon = null
  terminal = null
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="diagnostics-collect-modal"
    :title="t('settings.diagnostics.title', 'Download diagnostic data')"
    :mask-closable="stage !== 'running'"
    :closable="stage !== 'running'"
    :style="{ width: 'min(720px, calc(100vw - 24px))' }"
    @update:show="updateVisibility"
  >
    <template v-if="stage === 'idle'">
      <p class="diagnostics-purpose">
        {{ t('settings.diagnostics.purpose', 'Collect system logs, network state, and hardware information in a ZIP file. OneKVM and video keep running while progress logs stream live.') }}
      </p>
      <div class="diagnostics-actions">
        <n-button type="primary" @click="startCollect()">
          <template #icon><Play /></template>
          {{ t('settings.diagnostics.start', 'Start') }}
        </n-button>
      </div>
    </template>

    <template v-else>
      <div ref="terminalHost" class="diagnostics-terminal" />

      <n-alert
        v-if="stage === 'done'"
        type="success"
        class="diagnostics-alert"
        :title="t('settings.diagnostics.completeTitle', 'Collection complete')"
      >
        {{ t('settings.diagnostics.complete', 'The archive is ready. Download it when you need it.') }}
        <span v-if="archiveName" class="diagnostics-archive-name">{{ archiveName }}</span>
      </n-alert>

      <n-alert
        v-else-if="stage === 'error'"
        type="error"
        class="diagnostics-alert"
        :title="t('settings.diagnostics.failedTitle', 'Collection failed')"
      >
        {{ errorMessage || t('settings.diagnostics.failed', 'Diagnostics collection failed.') }}
      </n-alert>

      <div class="diagnostics-actions">
        <n-button
          v-if="stage === 'done'"
          type="primary"
          :loading="downloading"
          @click="downloadArchive"
        >
          <template #icon><Download /></template>
          {{ t('settings.diagnostics.download', 'Download zip') }}
        </n-button>
        <n-button
          v-else-if="stage === 'error'"
          @click="startCollect(pendingDiagnostics())"
        >
          {{ t('settings.diagnostics.retry', 'Try again') }}
        </n-button>
        <n-button v-if="stage === 'running'" disabled loading>
          {{ t('settings.diagnostics.running', 'Collecting…') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.diagnostics-purpose {
  margin: 0;
  color: var(--onekvm-muted, var(--muted-foreground));
  line-height: 1.55;
  font-size: 14px;
}

.diagnostics-terminal {
  height: min(360px, 50vh);
  border-radius: 8px;
  overflow: hidden;
  background: var(--onekvm-surface-inset);
  padding: 8px 10px;
}

.diagnostics-alert {
  margin-top: 14px;
}

.diagnostics-archive-name {
  display: block;
  margin-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.diagnostics-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
