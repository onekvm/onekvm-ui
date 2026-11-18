import { computed, shallowRef } from 'vue'

import type { SettingsMode } from '@/lib/settings-nav'

const STORAGE_KEY = 'onekvm.settings.mode'

function storedMode(): SettingsMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

// One mode per browser, shared by every settings page and form.
const mode = shallowRef<SettingsMode>(storedMode())
const simple = computed(() => mode.value === 'simple')

function setMode(value: SettingsMode) {
  mode.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* Private windows may refuse storage; the mode still applies to this page. */
  }
}

export function useSettingsMode() {
  return { mode, simple, setMode }
}
