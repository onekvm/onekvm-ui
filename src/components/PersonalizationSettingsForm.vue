<script setup lang="ts">
import { nextTick, ref, useId, type HTMLAttributes } from 'vue'
import { NTabs, NTab } from 'naive-ui'
import { type PersonalizationConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import PersonalizationIdentitySettings from './personalization/PersonalizationIdentitySettings.vue'
import PersonalizationToolbarSettings from './personalization/PersonalizationToolbarSettings.vue'
import PersonalizationInterfaceSettings from './personalization/PersonalizationInterfaceSettings.vue'
import PersonalizationNoSignalSettings from './personalization/PersonalizationNoSignalSettings.vue'
import PersonalizationPreview from './personalization/PersonalizationPreview.vue'

defineProps<{
  modelValue: PersonalizationConfig
  hostname: string
  deviceModel: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PersonalizationConfig]
  validity: [valid: boolean]
}>()

const tabNames = ['identity', 'toolbar', 'interface', 'noSignal'] as const
type PersonalizationTab = typeof tabNames[number]
const activeTab = ref<PersonalizationTab>('identity')
const idPrefix = useId()
const tabID = (name: PersonalizationTab) => `${idPrefix}-tab-${name}`
const panelID = (name: PersonalizationTab) => `${idPrefix}-panel-${name}`

async function handleTabKeydown(event: KeyboardEvent, name: PersonalizationTab) {
  const index = tabNames.indexOf(name)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabNames.length
  else if (event.key === 'ArrowLeft') next = (index + tabNames.length - 1) % tabNames.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabNames.length - 1
  else if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activeTab.value = tabNames[next]!
  await nextTick()
  document.getElementById(tabID(activeTab.value))?.focus()
}

function tabAttributes(name: PersonalizationTab): HTMLAttributes {
  return {
    id: tabID(name),
    role: 'tab',
    tabindex: activeTab.value === name ? 0 : -1,
    'aria-selected': activeTab.value === name,
    'aria-controls': panelID(name),
    onKeydown: (event: KeyboardEvent) => handleTabKeydown(event, name),
  }
}
</script>

<template>
  <div class="personalization-settings">
    <NTabs
      v-model:value="activeTab"
      class="host-tabs personalization-tabs"
      type="line"
      default-value="identity"
      role="tablist"
      :aria-label="t('settings.advancedSettings.personalization')"
      aria-orientation="horizontal"
      :animated="false"
    >
      <NTab v-for="name in tabNames" :key="name" :name="name" v-bind="tabAttributes(name)">
        {{ t(`settings.advancedSettings.personalizationPage.tabs.${name}`) }}
      </NTab>
    </NTabs>
    <div v-show="activeTab === 'identity'" :id="panelID('identity')" class="personalization-tab-panel" role="tabpanel" :aria-labelledby="tabID('identity')" tabindex="0">
      <PersonalizationIdentitySettings
        :model-value="modelValue"
        :hostname="hostname"
        :device-model="deviceModel"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
        @validity="emit('validity', $event)"
      />
    </div>
    <div v-show="activeTab === 'toolbar'" :id="panelID('toolbar')" class="personalization-tab-panel" role="tabpanel" :aria-labelledby="tabID('toolbar')" tabindex="0">
      <PersonalizationToolbarSettings :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <div v-show="activeTab === 'interface'" :id="panelID('interface')" class="personalization-tab-panel" role="tabpanel" :aria-labelledby="tabID('interface')" tabindex="0">
      <PersonalizationInterfaceSettings :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <div v-show="activeTab === 'noSignal'" :id="panelID('noSignal')" class="personalization-tab-panel" role="tabpanel" :aria-labelledby="tabID('noSignal')" tabindex="0">
      <PersonalizationNoSignalSettings :disabled="disabled" />
    </div>
    <PersonalizationPreview v-if="activeTab === 'identity' || activeTab === 'toolbar'" :model-value="modelValue" :hostname="hostname" :device-model="deviceModel" />
  </div>
</template>

<style scoped>
.personalization-settings { display: grid; gap: 22px; min-width: 0; }
.personalization-tabs, .personalization-tab-panel { min-width: 0; }
.personalization-tab-panel:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; border-radius: var(--radius); }
.personalization-tabs :deep(.n-tabs-tab) { min-height: 44px; }
.personalization-tabs :deep(.n-tabs-tab:focus-visible) { outline: 2px solid var(--primary); outline-offset: -2px; border-radius: var(--radius); }
.personalization-settings :deep(.personalization-tab-content) { display: grid; gap: 22px; }
.personalization-settings :deep(.personalization-section) { display: grid; gap: 16px; }
.personalization-settings :deep(.personalization-section + .personalization-section) { padding-top: 20px; border-top: 1px solid var(--border); }
.personalization-settings :deep(.personalization-section header h2) { margin: 0; color: var(--foreground); font-size: 14px; }
.personalization-settings :deep(.personalization-section header p) { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.personalization-settings :deep(.personalization-section .n-form-item) { margin-bottom: 0; }
.personalization-settings :deep(.personalization-section-heading) { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.personalization-settings :deep(.personalization-section-heading .n-button) { flex: 0 0 auto; }
.personalization-settings :deep(.personalization-switch-row) { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
.personalization-settings :deep(.personalization-switch-row label) { color: var(--foreground); font-size: 13px; }
.personalization-settings :deep(.personalization-switch-row p) { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
</style>
