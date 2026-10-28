<script setup lang="ts">
import { computed, watch } from 'vue'
import type { SelectProps } from 'naive-ui'
import type { EDIDStatus, EDIDWriteMode } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ status: EDIDStatus; value: EDIDWriteMode; disabled?: boolean; dropdown?: boolean; selectProps?: SelectProps }>()
const emit = defineEmits<{ 'update:value': [value: EDIDWriteMode]; 'update:show': [show: boolean] }>()
const modes = computed(() => props.status.write_modes)
const visible = computed(() => modes.value?.permanent || modes.value?.temporary)
const options = computed(() => [
  { value: 'permanent' as const, supported: !!modes.value?.permanent, label: t('settings.advancedSettings.displayPage.edidWritePermanent', 'Permanent write') },
  { value: 'temporary' as const, supported: !!modes.value?.temporary, label: t('settings.advancedSettings.displayPage.edidWriteTemporary', 'Temporary write') },
])
const selectOptions = computed(() => options.value.map(option => ({ ...option, disabled: !option.supported })))
const hint = computed(() => props.value === 'temporary'
  ? t('settings.advancedSettings.displayPage.edidWriteTemporaryHint', 'Stored in RAM. Lost when the capture chip resets or loses power. HDMI reconnects briefly.')
  : t('settings.advancedSettings.displayPage.edidWritePermanentHint', 'Writes to the capture chip Flash and survives power loss.'))
watch([modes, () => props.value], () => {
  if (modes.value && visible.value && !modes.value[props.value])
    emit('update:value', modes.value.permanent ? 'permanent' : 'temporary')
}, { immediate: true })
</script>

<template>
  <fieldset v-if="visible" class="edid-write-mode">
    <legend>{{ t('settings.advancedSettings.displayPage.edidWriteMode', 'Write mode') }}</legend>
    <n-select
      v-if="dropdown"
      v-bind="selectProps"
      :aria-label="t('settings.advancedSettings.displayPage.edidWriteMode', 'Write mode')"
      :value="value"
      :options="selectOptions"
      :disabled="disabled"
      @update:value="emit('update:value', $event)"
      @update:show="emit('update:show', $event)"
    />
    <n-radio-group v-else :value="value" :disabled="disabled" @update:value="emit('update:value', $event)">
      <div class="edid-write-options">
        <n-tooltip v-for="option in options" :key="option.value" :disabled="option.supported">
          <template #trigger>
            <span :tabindex="option.supported ? undefined : 0">
              <n-radio :value="option.value" :disabled="disabled || !option.supported">{{ option.label }}</n-radio>
            </span>
          </template>
          {{ t('settings.advancedSettings.displayPage.edidWriteUnsupported', 'This device does not support this write mode.') }}
        </n-tooltip>
      </div>
    </n-radio-group>
    <p>{{ hint }}</p>
  </fieldset>
</template>

<style scoped>
.edid-write-mode { border: 0; padding: 0; margin: 0; min-width: 0; }
.edid-write-options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
legend { margin-bottom: 6px; font-size: 12px; color: var(--muted-foreground); }
p { margin: 6px 0 0; font-size: 12px; line-height: 1.6; color: var(--muted-foreground); }
</style>
