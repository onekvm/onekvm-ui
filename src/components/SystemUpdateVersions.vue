<script setup lang="ts">
import type { SystemUpdateSlot, SystemUpdateStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  currentVersion?: string
  currentBuildId?: string
  update: SystemUpdateStatus | null
  switchingSlot: string
}>()
const emit = defineEmits<{ 'select-slot': [slot: SystemUpdateSlot] }>()
const key = 'settings.advancedSettings.systemPage.'

function slotVersion(slot: SystemUpdateSlot) {
  if (slot.class === 'rootfs' && slot.state === 'booted' && props.currentBuildId) return props.currentBuildId
  return slot.version || t(key + 'versionNotRecorded', 'Not recorded')
}
</script>

<template>
  <section class="system-settings-group system-update-versions">
    <h2>{{ t(key + 'currentSystem', 'Current system') }}</h2>
    <dl class="system-version-details">
      <div>
        <dt>{{ t(key + 'osVersion', 'OS version') }}</dt>
        <dd><code>{{ currentVersion || t(key + 'versionNotRecorded', 'Not recorded') }}</code></dd>
      </div>
      <div>
        <dt>{{ t(key + 'buildId', 'Build ID') }}</dt>
        <dd><code class="system-current-build-id">{{ currentBuildId || t(key + 'versionNotRecorded', 'Not recorded') }}</code></dd>
      </div>
    </dl>
  </section>

  <section v-if="update" class="system-settings-group">
    <h2>{{ t(key + 'bootSlots', 'A/B boot slots') }}</h2>
    <ul class="system-slot-list">
      <li v-for="slot in update.slots" :key="slot.name">
        <div class="system-slot-name">
          <strong>{{ t(key + 'slot', 'Slot') }} {{ slot.bootname || slot.name }}</strong>
          <span class="system-slot-version"><span>{{ t(key + 'buildId', 'Build ID') }}</span><code>{{ slotVersion(slot) }}</code></span>
          <span>{{ slot.device }}</span>
        </div>
        <div class="system-slot-badges">
          <span v-if="slot.state === 'booted'" class="system-slot-badge active">{{ t(key + 'booted', 'Booted') }}</span>
          <span v-if="slot.name === update.primary_slot" class="system-slot-badge primary">{{ t(key + 'nextBoot', 'Next boot') }}</span>
          <span class="system-slot-badge" :class="{ bad: slot.boot_status === 'bad' }">
            {{ slot.boot_status === 'bad' ? t(key + 'bad', 'Bad') : t(key + 'good', 'Good') }}
          </span>
        </div>
        <n-button secondary :disabled="slot.name === update.primary_slot || update.operation !== 'idle'"
          :loading="switchingSlot === slot.name" @click="emit('select-slot', slot)">
          {{ t(key + 'useNextBoot', 'Use for next boot') }}
        </n-button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.system-version-details { display: grid; gap: 12px; margin: 0; }
.system-version-details > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: baseline; gap: 16px; }
.system-version-details dt { color: var(--muted-foreground); font-size: 12px; }
.system-version-details dd { min-width: 0; margin: 0; color: var(--foreground); font-size: 13px; }
.system-version-details code, .system-slot-version code { font-family: var(--onekvm-font-mono); overflow-wrap: anywhere; user-select: all; }
.system-slot-name .system-slot-version { display: flex; flex-wrap: wrap; gap: 4px 8px; overflow: visible; white-space: normal; }
.system-slot-name .system-slot-version code { min-width: 0; color: var(--foreground); font-size: 12px; }
@media (max-width: 600px) {
  .system-version-details > div { grid-template-columns: 1fr; gap: 4px; }
}
</style>
