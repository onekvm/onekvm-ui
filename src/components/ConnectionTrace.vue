<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import {
  connectionTraceFrame,
  connectionTraceHidden,
  connectionTraceHoldMs,
  type ConnectionTraceFrame,
  type ConnectionTraceLive,
} from '@/lib/connection-trace'

const props = defineProps<{
  usbConnected: boolean
  videoConnected: boolean
}>()

const readyAt: Record<string, number> = {}
let started = 0
let reduced = false
if (props.usbConnected) readyAt.usb = 0
if (props.videoConnected) readyAt.video = 0
const frame = shallowRef<ConnectionTraceFrame>(connectionTraceFrame(0, undefined, { readyAt: { ...readyAt } }))
let raf = 0
let hideTimer = 0
let reduceQuery: MediaQueryList | undefined

function stamp(elapsed: number) {
  if (props.usbConnected && readyAt.usb === undefined) readyAt.usb = elapsed
  if (props.videoConnected && readyAt.video === undefined) readyAt.video = elapsed
}

function liveAt(now: number): ConnectionTraceLive {
  stamp(Math.max(0, now - started))
  return { readyAt: { ...readyAt } }
}

function resetClock(now: number) {
  started = now
  delete readyAt.usb
  delete readyAt.video
  stamp(0)
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  if (hideTimer) window.clearTimeout(hideTimer)
  hideTimer = 0
}

function armReducedHide(now: number) {
  const next = connectionTraceFrame(Math.max(0, now - started), undefined, liveAt(now))
  if (!next.settled) {
    frame.value = next
    return
  }
  if (hideTimer || frame.value.hidden) return
  frame.value = { ...next, opacity: 1, hidden: false }
  hideTimer = window.setTimeout(() => {
    hideTimer = 0
    frame.value = connectionTraceHidden()
  }, connectionTraceHoldMs())
}

function preferStill() {
  reduced = true
  stop()
  resetClock(performance.now())
  armReducedHide(performance.now())
}

function play() {
  reduced = false
  stop()
  const origin = performance.now()
  resetClock(origin)
  let signature = ''
  const tick = (now: number) => {
    const next = connectionTraceFrame(now - origin, undefined, liveAt(now))
    if (next.signature !== signature) {
      signature = next.signature
      frame.value = next
    }
    if (!next.hidden) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function syncMotion() {
  if (reduceQuery?.matches) preferStill()
  else play()
}

watch(() => [props.usbConnected, props.videoConnected] as const, () => {
  if (!started || frame.value.hidden || !reduced) return
  armReducedHide(performance.now())
})

onMounted(() => {
  reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduceQuery.addEventListener('change', syncMotion)
  syncMotion()
})

onBeforeUnmount(() => {
  stop()
  reduceQuery?.removeEventListener('change', syncMotion)
})
</script>

<template>
  <div
    v-if="!frame.hidden"
    class="connection-trace"
    :style="{ opacity: frame.opacity }"
    aria-hidden="true"
  >
    <div v-if="frame.logo.length || frame.logoCursor" class="trace-logo">
      <div v-for="(row, index) in frame.logo" :key="index" class="trace-logo-row">
        <span
          v-for="(run, runIndex) in row"
          :key="runIndex"
          :class="run.color === 'kvm' ? 'trace-logo-kvm' : run.color === 'meta' ? 'trace-logo-meta' : 'trace-logo-one'"
        >{{ run.text }}</span><span v-if="frame.logoCursor && index === frame.logo.length - 1" class="trace-cursor" />
      </div>
      <div v-if="frame.logoCursor && !frame.logo.length" class="trace-logo-row">
        <span class="trace-cursor" />
      </div>
    </div>
    <div v-if="frame.calls.length" class="trace-calls">
      <article v-for="call in frame.calls" :key="call.id" class="trace-block">
        <div class="trace-call">
          <span class="trace-mark" :data-status="call.status">
            <span v-if="call.status === 'running'" class="trace-spin" />
            <span v-else class="trace-dot" />
          </span>
          <code class="trace-code">
            <span v-for="(token, index) in call.tokens" :key="`${call.id}-${index}`" :class="`trace-${token.kind}`">{{ token.text }}</span><span v-if="call.cursor" class="trace-cursor" />
          </code>
        </div>
        <div v-if="call.outputs.length" class="trace-lines">
          <div v-for="(line, index) in call.outputs" :key="`${call.id}-${index}`" class="trace-line" :class="{ 'trace-line-result': !line.key }">
            <span class="trace-gutter">{{ index === 0 ? '⎿' : '' }}</span>
            <span v-if="line.key" class="trace-key">{{ line.key }}</span>
            <span class="trace-val">{{ line.value }}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.connection-trace {
  position: absolute;
  z-index: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: max-content;
  max-width: min(640px, calc(100% - 16px));
  padding: 10px 16px 12px 14px;
  pointer-events: none;
  user-select: none;
  font-family: "DejaVu Sans Mono", "Noto Sans Mono", var(--onekvm-font-mono);
  font-size: 12.5px;
  line-height: 1.45;
  font-variant-ligatures: none;
  background: radial-gradient(130% 160% at 0% 100%, rgb(2 3 4 / 86%) 0%, rgb(2 3 4 / 62%) 42%, transparent 76%);
}

.trace-logo {
  margin: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0;
  white-space: pre;
}

.trace-logo-row { min-height: 1em; }
.trace-logo-one { color: #f4f7fb; }
.trace-logo-kvm { color: #1677ff; }
.trace-logo-meta { color: #9aa6b2; }

.trace-block + .trace-block { margin-top: 12px; }

.trace-call {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 18px;
}

.trace-mark {
  display: grid;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  place-items: center;
}

.trace-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8e9aa6;
}

.trace-spin {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgb(215 119 87 / 28%);
  border-top-color: #d77757;
  border-radius: 50%;
  animation: trace-spin 700ms linear infinite;
}

.trace-code {
  min-width: 0;
  color: #e7eef5;
  font: inherit;
  white-space: nowrap;
}

.trace-ident,
.trace-fn { color: #e7eef5; }
.trace-fn { font-weight: 560; }
.trace-prop { color: #9dc4f5; }
.trace-punct { color: #73808c; }

.trace-cursor {
  display: inline-block;
  width: 7px;
  height: 0.95em;
  margin-left: 1px;
  background: #d77757;
  vertical-align: -0.12em;
  animation: trace-cursor 1s steps(1) infinite;
}

.trace-lines {
  display: grid;
  margin: 1px 0 0 22px;
}

.trace-line {
  display: grid;
  grid-template-columns: 1.35em 9ch auto;
  column-gap: 0.85ch;
  align-items: baseline;
  min-height: 18px;
}

.trace-line-result { grid-template-columns: 1.35em auto; }

.trace-gutter {
  color: #667381;
  font-size: 13px;
  line-height: 1;
}

.trace-key { color: #8b98a5; }
.trace-val { color: #e4ebf2; }

@keyframes trace-spin { to { transform: rotate(360deg); } }
@keyframes trace-cursor {
  0%, 45% { opacity: 1; }
  46%, 100% { opacity: 0; }
}

@media (max-width: 720px), (max-height: 520px) {
  .connection-trace {
    gap: 8px;
    padding: 20px 16px 12px 12px;
    font-size: 11px;
  }

  .trace-logo { font-size: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .trace-spin,
  .trace-cursor { animation: none; }
}
</style>
