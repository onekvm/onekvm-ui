import { computed } from 'vue'
import { useToolboxContext } from './useToolbox'
import { isRootOnlyToolbarIcon, TOOLBAR_ICON_IDS } from '@/lib/toolbar-icons'
import { toolbarIconLabel } from '@/lib/toolbar-labels'
import { USB_GAMEPAD_UI_ENABLED } from '@/lib/ui-features'
import { t } from '@/i18n/runtime'

export function useToolbarFolderOptions() {
  const toolbox = useToolboxContext()
  return computed(() => [
    { type: 'group' as const, label: t('toolbar.folders.builtin', 'Toolbar buttons'), key: 'builtin', children: TOOLBAR_ICON_IDS.filter(id => !isRootOnlyToolbarIcon(id) && (id !== 'gamepad' || USB_GAMEPAD_UI_ENABLED)).map(id => ({ value: id, label: toolbarIconLabel(id) })) },
    { type: 'group' as const, label: t('toolbox.pinned', 'Pinned tools'), key: 'tools', children: toolbox.pinned.map(({ tool }) => ({ value: `tool:${tool.id}`, label: tool.title })) },
  ])
}
