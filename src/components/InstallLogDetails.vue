<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef, useId, watch } from 'vue'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { t } from '@/i18n/runtime'
import { xtermTheme } from '@/lib/terminal-theme'
import { activeTheme } from '@/theme/runtime'

const props = withDefaults(defineProps<{ log: string; truncated?: boolean; failed?: boolean }>(), {
  truncated: false, failed: false,
})
const open = shallowRef(props.failed)
const host = shallowRef<HTMLElement | null>(null)
const fallback = shallowRef(false)
const outputId = useId()
let terminal: Terminal | null = null
let fit: FitAddon | null = null
let resize: ResizeObserver | null = null
let rendered = ''
let generation = 0

function dispose() {
  generation += 1
  resize?.disconnect()
  resize = null
  terminal?.dispose()
  terminal = null
  fit = null
  rendered = ''
}

function renderLog() {
  if (!terminal) return
  const content = props.log.replace(/\r?\n/g, '\r\n')
  if (content === rendered) return
  const current = terminal
  const follow = current.buffer.active.viewportY >= current.buffer.active.baseY
  const previousLine = current.buffer.active.viewportY
  const append = content.startsWith(rendered)
  const next = append ? content.slice(rendered.length) : content
  if (!append) current.reset()
  rendered = content
  current.write(next, () => {
    if (terminal !== current) return
    if (follow) current.scrollToBottom()
    else current.scrollToLine(Math.min(previousLine, current.buffer.active.baseY))
  })
}

async function initialize() {
  dispose()
  fallback.value = false
  const current = generation
  await nextTick()
  if (!open.value || !host.value) return
  try {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css'),
    ])
    if (current !== generation || !open.value || !host.value) return
    terminal = new Terminal({
      disableStdin: true, cursorBlink: false, convertEol: true, screenReaderMode: true,
      fontSize: 11, lineHeight: 1.4, scrollback: 2000,
      fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      theme: xtermTheme(activeTheme.value.appearance),
    })
    fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.value)
    fit.fit()
    resize = new ResizeObserver(() => fit?.fit())
    resize.observe(host.value)
    renderLog()
  } catch {
    if (current === generation) fallback.value = true
  }
}

watch(open, value => { if (value) void initialize(); else dispose() }, { immediate: true })
watch(() => props.failed, value => { if (value) open.value = true })
watch(() => props.log, renderLog)
watch(() => activeTheme.value.appearance, appearance => {
  if (terminal) terminal.options.theme = xtermTheme(appearance)
})
onBeforeUnmount(dispose)
</script>

<template>
  <details class="install-log-details" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary :aria-controls="outputId">{{ t('settings.plugins.installLogDetails', 'Details') }}</summary>
    <div v-if="open" :id="outputId" class="install-log-output">
      <p v-if="truncated" class="install-log-hint">{{ t('settings.plugins.installLogTruncated', 'Showing the most recent installation output.') }}</p>
      <p v-if="!log" class="install-log-hint">{{ t('settings.plugins.installLogWaiting', 'Waiting for installation output…') }}</p>
      <pre v-if="fallback" class="install-log-fallback" tabindex="0">{{ log }}</pre>
      <div v-else ref="host" class="install-log-terminal" :aria-label="t('settings.plugins.installLog', 'Installation log')" />
    </div>
  </details>
</template>

<style scoped>
.install-log-details { width: 100%; min-width: 0; text-align: start; }
.install-log-details > summary { width: fit-content; padding: 6px 0; color: var(--foreground); font-size: 12px; cursor: pointer; }
.install-log-details > summary:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.install-log-output { margin-top: 6px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-md, 6px); background: var(--secondary); }
.install-log-terminal, .install-log-fallback { height: min(220px, 32vh); min-height: 120px; }
.install-log-terminal { min-width: 0; overflow: hidden; }
.install-log-fallback { margin: 0; overflow: auto; font: 11px/1.4 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.install-log-hint { margin: 0 0 8px; color: var(--muted-foreground); font-size: 11px; }
</style>
