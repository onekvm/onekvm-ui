<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { settleUninstall, uninstallDialog } from '@/composables/useUninstallExtension'
import { t } from '@/i18n/runtime'

const overlayTo = useOverlayMount()
const message = useMessage()

const prompt = computed(() => (
  t('settings.plugins.uninstallConfirm', 'Uninstall {name}?').replace('{name}', uninstallDialog.name)
))

function updateShow(show: boolean) {
  if (!show) cancel()
}

function cancel() {
  if (uninstallDialog.loading) return
  settleUninstall(false)
}

async function confirm() {
  if (uninstallDialog.loading || !uninstallDialog.id) return
  uninstallDialog.loading = true
  try {
    await api.removeExtension(uninstallDialog.id, { deleteData: uninstallDialog.deleteData })
    message.success(t('settings.plugins.uninstalled', 'Plugin uninstalled'))
    window.dispatchEvent(new Event('onekvm:extensions-changed'))
    settleUninstall(true)
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    uninstallDialog.loading = false
  }
}
</script>

<template>
  <n-modal
    :show="uninstallDialog.show"
    :to="overlayTo"
    :mask-closable="!uninstallDialog.loading"
    :close-on-esc="!uninstallDialog.loading"
    @update:show="updateShow"
  >
    <n-card
      class="uninstall-extension-dialog"
      :title="t('settings.plugins.uninstall', 'Uninstall')"
      :closable="!uninstallDialog.loading"
      role="dialog"
      aria-modal="true"
      @close="cancel"
    >
      <p class="uninstall-extension-prompt">{{ prompt }}</p>
      <n-checkbox
        :checked="uninstallDialog.deleteData"
        :disabled="uninstallDialog.loading"
        @update:checked="(checked: boolean) => { uninstallDialog.deleteData = checked }"
      >
        {{ t('settings.plugins.uninstallDeleteData', 'Delete plugin data') }}
      </n-checkbox>
      <template #footer>
        <div class="uninstall-extension-actions">
          <n-button :disabled="uninstallDialog.loading" @click="cancel">
            {{ t('settings.plugins.cancel', 'Cancel') }}
          </n-button>
          <n-button
            type="error"
            :loading="uninstallDialog.loading"
            :disabled="uninstallDialog.loading"
            @click="confirm"
          >
            {{ t('settings.plugins.uninstall', 'Uninstall') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.uninstall-extension-dialog {
  width: min(420px, calc(100vw - 28px));
}
.uninstall-extension-prompt {
  margin: 0 0 14px;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.55;
}
.uninstall-extension-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
