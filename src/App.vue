<script setup lang="ts">
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui'

import AppShell from '@/components/AppShell.vue'
import AuthGate from '@/components/AuthGate.vue'
import UIUpdateGuard from '@/components/UIUpdateGuard.vue'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1677ff',
    primaryColorHover: '#3d91ff',
    primaryColorPressed: '#0f5fd7',
    primaryColorSuppl: '#1677ff',
    infoColor: '#1677ff',
    infoColorHover: '#3d91ff',
    infoColorPressed: '#0f5fd7',
    infoColorSuppl: '#1677ff',
    successColor: '#38b879',
    warningColor: '#d6a746',
    errorColor: '#df6262',
    cubicBezierEaseIn: 'cubic-bezier(0.4, 0, 1, 1)',
    cubicBezierEaseOut: 'cubic-bezier(0, 0, 0, 1)',
    borderRadius: '4px',
    borderRadiusSmall: '3px',
    cardColor: '#171b20',
    modalColor: '#171b20',
    popoverColor: '#20252b',
    bodyColor: '#0d1013',
  },
  Button: {
    borderRadiusSmall: '4px',
  },
  Drawer: {
    color: '#171b20',
  },
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-dialog-provider>
      <n-message-provider placement="bottom-right">
        <UIUpdateGuard />
        <AuthGate>
          <AppShell />
        </AuthGate>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
