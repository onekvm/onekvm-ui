<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import AuthGate from '@/components/AuthGate.vue'
import UIUpdateGuard from '@/components/UIUpdateGuard.vue'
import UninstallExtensionDialog from '@/components/UninstallExtensionDialog.vue'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { useOneKVMTheme } from '@/theme/runtime'

const overlayTo = useOverlayMount()
const { naiveTheme, naiveOverrides } = useOneKVMTheme()
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">
    <n-global-style />
    <n-dialog-provider :to="overlayTo">
      <n-message-provider placement="bottom-right" :to="overlayTo">
        <UIUpdateGuard />
        <UninstallExtensionDialog />
        <AuthGate>
          <AppShell />
        </AuthGate>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
