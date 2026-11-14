<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { OneKVMStatus } from '@/api/client'
import {
  createProblemTracker,
  type ConsoleInputActivity,
  type ConsoleProblem,
  type ConsoleProblemAction,
} from '@/lib/console-problems'
import { hidReportIsPress } from '@/lib/hid-status'
import { onekvm } from '@/lib/onekvm'
import ConsoleFloatingWindow from './ConsoleFloatingWindow.vue'

const props = defineProps<{
  problems: readonly ConsoleProblem[]
  status: OneKVMStatus | null | undefined
  enabled: boolean
}>()

const message = useMessage()
const shown = shallowRef<ConsoleProblem | null>(null)
const running = ref<string | null>(null)
const input: ConsoleInputActivity = { reportAt: 0, pressAt: 0 }
let tracker = createProblemTracker(props.problems)
let unsubscribe: (() => void) | undefined

function evaluate() {
  const next = tracker.update({ status: props.status, input, now: Date.now() })
  shown.value = props.enabled ? next : null
}

function close() {
  tracker.dismiss()
  shown.value = null
}

async function runAction(action: ConsoleProblemAction) {
  if (running.value) return
  running.value = action.id
  try {
    const done = await action.run()
    if (done) message.success(done)
    close()
  } catch (error) {
    message.error(action.failure?.() ?? String(error))
    console.error(`console problem action ${action.id} failed`, error)
  } finally {
    running.value = null
  }
}

watch(() => props.problems, (problems) => {
  tracker = createProblemTracker(problems)
  evaluate()
})
watch(() => [props.status, props.enabled], evaluate, { immediate: true })

onMounted(() => {
  unsubscribe = onekvm.subscribeHIDReports((report) => {
    const now = Date.now()
    input.reportAt = now
    if (hidReportIsPress(report)) input.pressAt = now
    if (!shown.value) evaluate()
  })
})

onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <ConsoleFloatingWindow
    :show="Boolean(shown)"
    :title="shown?.title() ?? ''"
    :draggable="false"
    class="console-problem-window"
    aria-live="assertive"
    @close="close"
  >
    <template v-if="shown?.icon" #title-icon>
      <component :is="shown.icon" :size="16" aria-hidden="true" />
    </template>
    <div v-if="shown" class="console-problem-body">
      <p v-if="shown.intro">{{ shown.intro() }}</p>
      <ul v-if="shown.checks">
        <li v-for="check in shown.checks()" :key="check">{{ check }}</li>
      </ul>
      <p v-if="shown.note" class="console-problem-note">{{ shown.note() }}</p>
      <div v-if="shown.actions?.length" class="console-problem-actions">
        <n-button
          v-for="action in shown.actions"
          :key="action.id"
          size="small"
          :type="action.primary ? 'primary' : 'default'"
          :disabled="Boolean(running) && running !== action.id"
          :loading="running === action.id"
          @click="runAction(action)"
        >
          {{ action.label() }}
        </n-button>
      </div>
    </div>
  </ConsoleFloatingWindow>
</template>

<style scoped>
.console-problem-body {
  display: grid;
  gap: 10px;
  padding: 14px 16px 16px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.console-problem-body p,
.console-problem-body ul {
  margin: 0;
}

.console-problem-body ul {
  padding-left: 20px;
}

.console-problem-body li + li {
  margin-top: 4px;
}

.console-problem-note {
  font-size: 12px;
}

.console-problem-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}
</style>
