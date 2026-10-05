<script setup lang="ts">
import { ref } from 'vue'
import { NButton, useMessage, useThemeVars } from 'naive-ui'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
const props = defineProps<{ owner: string | null | undefined }>()
const mountTo = useOverlayMount()
const pending = ref(false)
const message = useMessage()
const theme = useThemeVars()
async function stop() {
  if (pending.value || !props.owner) return
  pending.value = true
  try { await api.invokeExtension(props.owner, 'stop_run', {}) }
  catch (error) { message.error(error instanceof Error ? error.message : String(error)) }
  finally { pending.value = false }
}
</script>
<template>
  <Teleport :to="mountTo">
    <div v-if="owner" class="macro-run-banner" :style="{ background: theme.popoverColor, color: theme.textColor1, borderColor: theme.borderColor }" data-toolbox-local role="status">
      <span>{{ t('toolbox.macroExclusive') }}</span>
      <NButton size="small" type="error" secondary :loading="pending" @click="stop">{{ t('toolbox.stopMacro') }}</NButton>
    </div>
  </Teleport>
</template>
<style scoped>
.macro-run-banner { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 12px); left: 50%; transform: translateX(-50%); z-index: 1920; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-large); background: var(--onekvm-surface-overlay); color: var(--foreground); box-shadow: var(--onekvm-shadow-panel); }
@media (pointer: coarse) { .macro-run-banner :deep(button) { min-height: 44px; } }
</style>
