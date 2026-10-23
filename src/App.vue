<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import AppShell from '@/components/AppShell.vue'
import WindowTaskbar from '@/components/WindowTaskbar.vue'
import AuthGate from '@/components/AuthGate.vue'
import UIUpdateGuard from '@/components/UIUpdateGuard.vue'
import UninstallExtensionDialog from '@/components/UninstallExtensionDialog.vue'
import { useAccessRevokedRoute } from '@/composables/useAccessRevokedRoute'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { useOneKVMTheme } from '@/theme/runtime'

const overlayTo = useOverlayMount()
const { naiveTheme, naiveOverrides } = useOneKVMTheme()
const AccessRevokedPage = defineAsyncComponent(() => import('@/components/AccessRevokedPage.vue'))
const { noticeVisible, checking } = useAccessRevokedRoute()
</script>

<template>
  <AccessRevokedPage v-if="noticeVisible" />
  <n-config-provider v-else :theme="naiveTheme" :theme-overrides="naiveOverrides">
    <n-global-style />
    <n-dialog-provider :to="overlayTo">
      <n-message-provider placement="bottom-right" :to="overlayTo">
        <div v-if="checking" class="auth-loading" role="status" :aria-label="t('accessRevoked.checking')">
          <n-spin size="small" />
        </div>
        <template v-else>
          <UIUpdateGuard />
          <UninstallExtensionDialog />
          <AuthGate>
            <AppShell />
            <WindowTaskbar />
          </AuthGate>
        </template>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
