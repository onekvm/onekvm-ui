<script setup lang="ts">
import { NMessageProvider } from 'naive-ui'
import { type PersonalizationConfig } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import MessagePlacementPicker from '../MessagePlacementPicker.vue'
import MessagePlacementTestButton from '../MessagePlacementTestButton.vue'
import { t } from '@/i18n/runtime'
const props = defineProps<{
  modelValue: PersonalizationConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PersonalizationConfig]
}>()

function update(patch: Partial<PersonalizationConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

const overlayTo = useOverlayMount()
</script>

<template>
  <div class="personalization-tab-content">
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.windowBehavior', 'Interface effects') }}</h2>
      </header>
      <div class="personalization-switch-row">
        <label id="connection-animation-label">{{ t('settings.advancedSettings.personalizationPage.connectionAnimation', 'Bottom-left connection animation') }}</label>
        <n-switch
          :value="modelValue.connection_animation ?? true"
          :disabled="disabled"
          aria-labelledby="connection-animation-label"
          @update:value="update({ connection_animation: $event })"
        />
      </div>
      <div class="personalization-switch-row">
        <div>
          <label id="dim-windows-label">{{ t('settings.advancedSettings.personalizationPage.dimWindowsOnKvmFocus', 'Translucent windows when KVM has focus') }}</label>
          <p id="dim-windows-hint">{{ t('settings.advancedSettings.personalizationPage.dimWindowsOnKvmFocusHint', 'Set windows to 50% opacity while controlling KVM, except Performance and Virtual keyboard. Focusing a window restores its opacity.') }}</p>
        </div>
        <n-switch
          :value="modelValue.dim_windows_on_kvm_focus ?? true"
          :disabled="disabled"
          aria-labelledby="dim-windows-label"
          aria-describedby="dim-windows-hint"
          @update:value="update({ dim_windows_on_kvm_focus: $event })"
        />
      </div>
    </section>

    <section class="personalization-section">
      <header class="personalization-section-heading">
        <div>
          <h2>{{ t('settings.advancedSettings.personalizationPage.toastMessages') }}</h2>
          <p id="message-placement-hint">{{ t('settings.advancedSettings.personalizationPage.messagePlacementHint') }}</p>
        </div>
        <NMessageProvider :placement="modelValue.message_placement ?? 'bottom-right'" :to="overlayTo" :max="1">
          <MessagePlacementTestButton :disabled="disabled" />
        </NMessageProvider>
      </header>
      <MessagePlacementPicker
        :model-value="modelValue.message_placement ?? 'bottom-right'"
        :disabled="disabled"
        @update:model-value="update({ message_placement: $event })"
      />
    </section>
  </div>
</template>

<style scoped>

</style>
