<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'

import type { ConsoleProblem, ConsoleProblemAction } from '@/lib/console-problems'

defineProps<{
  problem: ConsoleProblem
  compact?: boolean
}>()

const emit = defineEmits<{ done: [] }>()

const message = useMessage()
const running = ref<string | null>(null)

async function runAction(action: ConsoleProblemAction) {
  if (running.value) return
  running.value = action.id
  try {
    const done = await action.run()
    if (done) message.success(done)
    emit('done')
  } catch (error) {
    message.error(action.failure?.() ?? String(error))
    console.error(`console problem action ${action.id} failed`, error)
  } finally {
    running.value = null
  }
}
</script>

<template>
  <div class="console-problem-body" :class="{ 'is-compact': compact }">
    <p v-if="problem.intro">{{ problem.intro() }}</p>
    <ul v-if="problem.checks">
      <li v-for="check in problem.checks()" :key="check">{{ check }}</li>
    </ul>
    <p v-if="problem.note" class="console-problem-note">{{ problem.note() }}</p>
    <div v-if="problem.actions?.length" class="console-problem-actions">
      <n-button
        v-for="action in problem.actions"
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

.console-problem-body.is-compact {
  gap: 8px;
  padding: 0;
  font-size: 12px;
  line-height: 1.45;
}

.console-problem-body p,
.console-problem-body ul {
  margin: 0;
}

.console-problem-body ul {
  padding-left: 18px;
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
