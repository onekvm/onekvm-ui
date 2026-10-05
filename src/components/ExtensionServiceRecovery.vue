<script setup lang="ts">
import { computed, ref } from 'vue'
import { Play } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import { api, type ExtensionService, type ExtensionStatus } from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'

const props = defineProps<{ extension: ExtensionStatus }>()
const emit = defineEmits<{ updated: [extension: ExtensionStatus] }>()

const message = useMessage()
const busy = ref('')
const stoppedServices = computed(() => (props.extension.services || []).filter((service) => !service.running))

function serviceName(service: ExtensionService) {
  const localized = service.i18n || {}
  const language = currentLanguage.value
  const normalized = language.replace('_', '-')
  const base = normalized.split('-')[0]
  return (localized[language] || localized[normalized] || localized[base] || localized.default)?.name || service.name
}

async function start(service: ExtensionService) {
  busy.value = service.id
  try {
    await api.serviceAction(`extension.${props.extension.id}.${service.id}`, 'start')
    emit('updated', await api.getExtension(props.extension.id))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section v-if="stoppedServices.length" class="extension-service-recovery" aria-live="polite">
    <div v-for="service in stoppedServices" :key="service.id" class="extension-service-recovery-row">
      <div class="extension-service-recovery-state">
        <span class="extension-service-recovery-dot" />
        <strong>{{ serviceName(service) }}</strong>
        <span>{{ t('settings.plugins.serviceStopped', 'Stopped') }}</span>
      </div>
      <n-button
        type="primary"
        secondary
        size="small"
        :loading="busy === service.id"
        :disabled="busy !== ''"
        @click="start(service)"
      >
        <template #icon><Play /></template>
        {{ t('settings.plugins.startService', 'Start') }}
      </n-button>
    </div>
  </section>
</template>

<style scoped>
.extension-service-recovery {
  display: grid;
  overflow: hidden;
  margin-bottom: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--card);
}
.extension-service-recovery-row {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 12px;
}
.extension-service-recovery-row + .extension-service-recovery-row { border-top: 1px solid var(--border); }
.extension-service-recovery-state { display: flex; min-width: 0; align-items: center; gap: 9px; }
.extension-service-recovery-state strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.extension-service-recovery-state > span:last-child { color: var(--muted-foreground); font-size: 12px; }
.extension-service-recovery-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 0 3px rgb(215 154 69 / 12%);
}

@media (max-width: 520px) {
  .extension-service-recovery-row { align-items: flex-start; }
  .extension-service-recovery-state { flex-wrap: wrap; padding-top: 5px; }
}
</style>
