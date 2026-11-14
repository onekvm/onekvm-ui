import { computed, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { api, type PersonalizationConfig } from '@/api/client'
import { normalizeToolbarFolders, toolbarLayoutOrder, type ToolbarLayout } from '@/lib/toolbar-layout'
import { useToolboxContext } from './useToolbox'

export function useToolbarLayout(identity: () => PersonalizationConfig | undefined) {
  const toolbox = useToolboxContext()
  const message = useMessage()
  const local = shallowRef<ToolbarLayout | null>(null)
  const saving = shallowRef(false)
  const layout = computed(() => local.value ?? identity() ?? {})
  const folders = computed(() => normalizeToolbarFolders(layout.value.toolbar_folders))
  const order = computed(() => toolbarLayoutOrder(layout.value, toolbox.pinned.map(({ tool }) => tool.id)))
  const showLabels = computed(() => Boolean(layout.value.toolbar_show_labels))
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
  return { layout, folders, order, showLabels, saving, save }
}
