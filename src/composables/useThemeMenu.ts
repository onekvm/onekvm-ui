import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { Monitor, Moon, Sun, Win98Theme } from '@/icons'
import {
  DEFAULT_ONEKVM_THEME_ID,
  LIGHT_ONEKVM_THEME_ID,
  WIN98_ONEKVM_THEME_ID,
} from '@/theme/model'
import { useOneKVMTheme } from '@/theme/runtime'

/** Shared by the console's desktop/mobile account menu and settings. */
export function useThemeMenu() {
  const { theme, appearance, activate, setAppearance } = useOneKVMTheme()
  const themeChoices = computed(() => [
    { key: 'system', label: t('settings.appearance.followSystem', 'System'), icon: Monitor },
    { key: 'light', label: t('settings.appearance.light', 'Light'), icon: Sun },
    { key: 'dark', label: t('settings.appearance.dark', 'Dark'), icon: Moon },
    { key: WIN98_ONEKVM_THEME_ID, label: t('settings.appearance.win98', 'Win98'), icon: Win98Theme },
  ])
  const selectedThemeChoice = computed(() => {
    if (appearance.value === 'system') return 'system'
    return theme.value.id === WIN98_ONEKVM_THEME_ID ? theme.value.id : appearance.value
  })

  function selectThemeChoice(choice: string) {
    if (choice === 'system') {
      activate(DEFAULT_ONEKVM_THEME_ID)
      setAppearance('system')
    } else if (choice === 'light' || choice === 'dark') {
      setAppearance(choice)
      activate(choice === 'light' ? LIGHT_ONEKVM_THEME_ID : DEFAULT_ONEKVM_THEME_ID)
    } else if (choice === WIN98_ONEKVM_THEME_ID) {
      setAppearance('light')
      activate(choice)
    }
  }

  const themeMenuProps = () => ({ class: 'host-theme-menu' })
  return { themeChoices, selectedThemeChoice, selectThemeChoice, themeMenuProps }
}
