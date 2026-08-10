<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Copy, RefreshCw, Search } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import type { FitAddon as FitAddonInstance } from '@xterm/addon-fit'
import type { Terminal as TerminalInstance } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { api } from '@/api/client'
import { t } from '@/i18n/runtime'

const lines = ref<string[]>([])
const lineLimit = ref(250)
const search = ref('')
const autoRefresh = ref(true)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const terminalHost = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const message = useMessage()

let refreshTimer: number | null = null
let resizeObserver: ResizeObserver | null = null
let terminal: TerminalInstance | null = null
let fitAddon: FitAddonInstance | null = null
let renderedContent = ''
let renderGeneration = 0
let componentMounted = false

const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

const lineOptions = [100, 250, 500, 1000].map((value) => ({
  label: String(value),
  value,
}))

function stripANSI(value: string) {
  ANSI_PATTERN.lastIndex = 0
  return value.replace(ANSI_PATTERN, '')
}

const filteredLines = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return lines.value
  return lines.value.filter((line) => stripANSI(line).toLocaleLowerCase().includes(query))
})

const emptyDescription = computed(() => lines.value.length > 0
  ? t('settings.advancedSettings.logsPage.noMatches', 'No matching log entries')
  : t('settings.advancedSettings.logsPage.empty', 'No log entries'),
)

function scrollToBottom() {
  terminal?.scrollToBottom()
  stickToBottom.value = true
}

function renderLogs(forceBottom = false) {
  if (!terminal) return
  const content = filteredLines.value.join('\r\n')
  const shouldScroll = forceBottom || stickToBottom.value
  const previousLine = terminal.buffer.active.viewportY

  if (content === renderedContent) {
    if (shouldScroll) scrollToBottom()
    return
  }

  renderedContent = content
  const generation = ++renderGeneration
  fitAddon?.fit()
  terminal.write(`\u001bc${content}${content ? '\u001b[0m' : ''}`, () => {
    if (!terminal || generation !== renderGeneration) return
    if (shouldScroll) scrollToBottom()
    else terminal.scrollToLine(Math.min(previousLine, terminal.buffer.active.baseY))
  })
}

async function initializeTerminal() {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])
  if (!componentMounted || !terminalHost.value) return
  terminal = new Terminal({
    allowTransparency: false,
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 11,
    lineHeight: 1.45,
    scrollback: 1100,
    theme: {
      background: '#11161a',
      foreground: '#c5ced5',
      cursor: '#11161a',
      selectionBackground: '#345d55',
      black: '#11161a',
      brightBlack: '#65717b',
      red: '#df6262',
      brightRed: '#f07878',
      green: '#42d2a4',
      brightGreen: '#63dfb6',
      yellow: '#d6a746',
      brightYellow: '#e7bc61',
      blue: '#61aef4',
      brightBlue: '#7bbdf7',
      magenta: '#bc8cf2',
      brightMagenta: '#cda5f5',
      cyan: '#55c9d8',
      brightCyan: '#78d7e2',
      white: '#c5ced5',
      brightWhite: '#f0f3f5',
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalHost.value)
  fitAddon.fit()
  terminal.onScroll((position) => {
    if (!terminal) return
    stickToBottom.value = position >= terminal.buffer.active.baseY
  })
  resizeObserver = new ResizeObserver(() => { fitAddon?.fit() })
  resizeObserver.observe(terminalHost.value)
  renderLogs(true)
}

async function refresh(forceBottom = false) {
  if (refreshing.value) return
  const shouldScroll = forceBottom || stickToBottom.value
  refreshing.value = true
  try {
    lines.value = await api.getLogs(lineLimit.value)
    error.value = ''
    await nextTick()
    renderLogs(shouldScroll)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

function restartRefreshTimer() {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
  refreshTimer = autoRefresh.value
    ? window.setInterval(() => { void refresh() }, 3000)
    : null
}

async function copyLogs() {
  const text = filteredLines.value.map(stripANSI).join('\n')
  if (!text) return
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('copy failed')
    }
    message.success(t('settings.advancedSettings.logsPage.copied', 'Logs copied'))
  } catch {
    message.error(t('settings.advancedSettings.logsPage.copyFailed', 'Failed to copy logs'))
  }
}

watch(autoRefresh, restartRefreshTimer)
watch(lineLimit, () => { void refresh(true) })
watch(search, async () => {
  await nextTick()
  renderLogs(stickToBottom.value)
})

onMounted(() => {
  componentMounted = true
  void initializeTerminal()
  void refresh(true)
  restartRefreshTimer()
})

onBeforeUnmount(() => {
  componentMounted = false
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
  resizeObserver?.disconnect()
  terminal?.dispose()
  resizeObserver = null
  fitAddon = null
  terminal = null
})
</script>

<template>
  <section class="logs-page">
    <div class="logs-toolbar">
      <label class="logs-field logs-search">
        <span>{{ t('settings.advancedSettings.logsPage.search', 'Search') }}</span>
        <n-input
          v-model:value="search"
          clearable
          :placeholder="t('settings.advancedSettings.logsPage.searchPlaceholder', 'Filter log entries')"
        >
          <template #prefix><Search :size="15" /></template>
        </n-input>
      </label>

      <label class="logs-field logs-limit">
        <span>{{ t('settings.advancedSettings.logsPage.lines', 'Lines') }}</span>
        <n-select v-model:value="lineLimit" :options="lineOptions" />
      </label>

      <label class="logs-auto-refresh">
        <span>{{ t('settings.advancedSettings.logsPage.autoRefresh', 'Auto refresh') }}</span>
        <n-switch v-model:value="autoRefresh" size="small" />
      </label>

      <div class="logs-actions">
        <n-button :disabled="filteredLines.length === 0" @click="copyLogs">
          <template #icon><Copy /></template>
          {{ t('settings.advancedSettings.logsPage.copy', 'Copy') }}
        </n-button>
        <n-button type="primary" :loading="refreshing" @click="refresh(true)">
          <template #icon><RefreshCw /></template>
          {{ t('settings.advancedSettings.logsPage.refresh', 'Refresh') }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="error" type="error" :bordered="false">
      {{ t('settings.advancedSettings.logsPage.loadFailed', 'Failed to load logs') }}: {{ error }}
    </n-alert>

    <div class="logs-console-shell">
      <header>
        <span>{{ t('settings.advancedSettings.logsPage.runtimeLog', 'Runtime log') }}</span>
        <small>{{ filteredLines.length }} / {{ lines.length }} {{ t('settings.advancedSettings.logsPage.lineUnit', 'lines') }}</small>
      </header>
      <n-spin :show="loading">
        <div class="logs-console" role="log" aria-live="polite">
          <div ref="terminalHost" class="logs-terminal" />
          <div v-if="!loading && filteredLines.length === 0" class="logs-empty">
            <n-empty :description="emptyDescription" />
          </div>
        </div>
      </n-spin>
    </div>
  </section>
</template>

<style scoped>
.logs-page {
  display: grid;
  gap: 14px;
}

.logs-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 104px max-content max-content;
  align-items: end;
  gap: 12px;
}

.logs-field {
  display: grid;
  gap: 6px;
}

.logs-field > span,
.logs-auto-refresh > span {
  color: #8e99a3;
  font-size: 11px;
  font-weight: 500;
}

.logs-auto-refresh {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.logs-actions {
  display: flex;
  gap: 8px;
}

.logs-console-shell {
  overflow: hidden;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #11161a;
}

.logs-console-shell > header {
  display: flex;
  height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid #30363d;
  background: #171c21;
}

.logs-console-shell > header span {
  color: #dce2e7;
  font-size: 12px;
  font-weight: 600;
}

.logs-console-shell > header small {
  color: #78848e;
  font-size: 10px;
}

.logs-console {
  position: relative;
  height: clamp(360px, calc(100vh - 265px), 720px);
  overflow: hidden;
}

.logs-terminal {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 10px 8px 8px 13px;
}

.logs-terminal :deep(.xterm) {
  height: 100%;
}

.logs-terminal :deep(.xterm-viewport) {
  scrollbar-color: #3b454e #11161a;
  scrollbar-width: thin;
}

.logs-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #11161a;
}

@media (max-width: 820px) {
  .logs-toolbar {
    grid-template-columns: minmax(0, 1fr) 96px;
  }

  .logs-auto-refresh {
    grid-column: 1;
  }

  .logs-actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}

@media (max-width: 560px) {
  .logs-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }

  .logs-limit {
    width: 120px;
  }

  .logs-auto-refresh,
  .logs-actions {
    grid-column: 1;
  }

  .logs-actions {
    justify-content: stretch;
  }

  .logs-actions :deep(.n-button) {
    flex: 1;
  }
}
</style>
