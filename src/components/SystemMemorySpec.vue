<script setup lang="ts">
import { CircleHelp, MemoryStick } from '@lucide/vue'
import { computed, shallowRef } from 'vue'
import { t } from '@/i18n/runtime'
import SystemSpecBadge from './SystemSpecBadge.vue'

const props = defineProps<{
  physicalBytes?: number
  memoryType?: string
  managedBytes?: number
  hardwareReservedBytes?: number | null
  linuxReservedBytes?: number | null
}>()

function formatMib(bytes: number) {
  return `${Math.round(bytes / 1048576)} MiB`
}

function formatCapacity(bytes: number) {
  return bytes >= 1073741824 && bytes % 1073741824 === 0
    ? `${bytes / 1073741824} GiB`
    : formatMib(bytes)
}

const helpOpen = shallowRef(false)
const physical = computed(() => props.physicalBytes || props.managedBytes || 0)
const reservationsKnown = computed(() => props.hardwareReservedBytes != null && props.linuxReservedBytes != null)
const reserved = computed(() => Math.max(0, physical.value - (props.managedBytes || 0)))
</script>

<template>
  <div>
    <dt>
      <MemoryStick :size="17" />{{ t('settings.advancedSettings.systemPage.installedMemory', 'Installed memory') }}
      <SystemSpecBadge
        v-if="memoryType"
        :value="memoryType"
        :label="t('settings.advancedSettings.systemPage.memoryType', 'Memory type')"
        :description="t('settings.advancedSettings.systemPage.memoryTypeHint', 'The physical RAM technology, such as DDR3 or DDR4.')"
      />
    </dt>
    <dd>
      <span>{{ physical ? formatCapacity(physical) : '-' }}</span>
      <span v-if="managedBytes" class="system-spec-detail">
        {{ t('settings.advancedSettings.systemPage.memoryAvailableTotal', 'Total available memory') }} {{ formatMib(managedBytes) }}
        <n-popover trigger="manual" :show="helpOpen" placement="bottom" :show-arrow="true">
          <template #trigger>
            <button type="button" class="system-memory-help" :aria-label="t('settings.advancedSettings.systemPage.memoryDetails', 'Memory details')" :aria-expanded="helpOpen" @mouseenter="helpOpen = true" @mouseleave="helpOpen = false" @focus="helpOpen = true" @blur="helpOpen = false"><CircleHelp :size="16" aria-hidden="true" /></button>
          </template>
          <div class="system-memory-breakdown">
            <strong>{{ t('settings.advancedSettings.systemPage.memoryDetails', 'Memory details') }}</strong>
            <dl>
              <div><dt>{{ t('settings.advancedSettings.systemPage.memoryPhysical', 'Physical RAM') }}</dt><dd>{{ formatMib(physical) }}</dd></div>
              <template v-if="reservationsKnown">
                <div><dt>{{ t('settings.advancedSettings.systemPage.memoryHardwareReserved', 'Hardware reserved') }}</dt><dd>{{ formatMib(hardwareReservedBytes ?? 0) }}</dd></div>
                <div><dt>{{ t('settings.advancedSettings.systemPage.memoryLinuxReserved', 'Linux reserved') }}</dt><dd>{{ formatMib(linuxReservedBytes ?? 0) }}</dd></div>
              </template>
              <div v-else><dt>{{ t('settings.advancedSettings.systemPage.memoryReserved', 'Reserved memory') }}</dt><dd>{{ formatMib(reserved) }}</dd></div>
              <div><dt>{{ t('settings.advancedSettings.systemPage.memoryAvailableTotal', 'Total available memory') }}</dt><dd>{{ formatMib(managedBytes) }}</dd></div>
            </dl>
            <p>{{ t('settings.advancedSettings.systemPage.memoryExplanation', 'After hardware and the kernel reserve the memory they need, Linux manages the rest.') }}</p>
          </div>
        </n-popover>
      </span>
    </dd>
  </div>
</template>
