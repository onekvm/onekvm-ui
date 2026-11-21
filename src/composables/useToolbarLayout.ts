import { computed, shallowRef, watch, type InjectionKey } from 'vue'
import { useMessage } from 'naive-ui'
import { api, type PersonalizationConfig } from '@/api/client'
import { normalizeToolbarFolders, toolbarAnyLabelShown, toolbarItemShowsLabel, toolbarLayoutOrder, type ToolbarLayout } from '@/lib/toolbar-layout'
import { useToolboxContext } from './useToolbox'

/** Tells toolbar slots whether their item shows text. */
export const toolbarItemLabelKey: InjectionKey<(id: string) => boolean> = Symbol('toolbar-item-label')

export function useToolbarLayout(identity: () => PersonalizationConfig | undefined) {
  const toolbox = useToolboxContext()
  const message = useMessage()
  const local = shallowRef<ToolbarLayout | null>(null)
  const saving = shallowRef(false)
  const layout = computed(() => local.value ?? identity() ?? {})
  const folders = computed(() => normalizeToolbarFolders(layout.value.toolbar_folders))
  const order = computed(() => toolbarLayoutOrder(layout.value, toolbox.pinned.map(({ tool }) => tool.id)))
  const showLabels = computed(() => toolbarAnyLabelShown(layout.value, order.value))
  const labelShown = (id: string) => toolbarItemShowsLabel(layout.value, id)
  watch(identity, () => { if (!saving.value) local.value = null })
  async function save(change: (layout: ToolbarLayout) => ToolbarLayout) {
    if (saving.value) return false
    const before = local.value
    local.value = change(layout.value)
    saving.value = true
    try {
      const config = await api.getConfig()
      const changed = change(config.personalization)
      const result = await api.savePersonalizationConfig({ ...config.personalization,
        toolbar_icons: changed.toolbar_icons, toolbar_folders: changed.toolbar_folders,
        toolbar_order: changed.toolbar_order, toolbar_show_labels: changed.toolbar_show_labels,
        toolbar_label_exceptions: changed.toolbar_label_exceptions,
        toolbar_label_position: changed.toolbar_label_position,
      })
      local.value = result
      return true
    } catch (error) {
      local.value = before
      message.error(error instanceof Error ? error.message : String(error))
      return false
    } finally { saving.value = false }
  }
  return { layout, folders, order, showLabels, labelShown, saving, save }
}
