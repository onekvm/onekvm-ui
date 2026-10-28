import { computed } from 'vue'
import type { ToolbarIconId, ToolbarIconPreference } from '@/api/client'
import { reorderToolbarIcon } from '@/lib/toolbar-icons'
import { useSortableListDrag } from './useSortableListDrag'

export function useToolbarIconDrag(
  icons: () => ToolbarIconPreference[],
  disabled: () => boolean | undefined,
  commit: (icons: ToolbarIconPreference[]) => void,
) {
  const { dragId, overId, startDrag, moveDrag, endDrag, cancelDrag } = useSortableListDrag<ToolbarIconId>({
    attribute: 'data-toolbar-icon',
    disabled,
    commit: (from, to) => commit(reorderToolbarIcon(icons(), from, to)),
  })
  const previewIcons = computed(() => dragId.value && overId.value
    ? reorderToolbarIcon(icons(), dragId.value, overId.value)
    : icons())
  return { dragId, previewIcons, startIconDrag: startDrag, moveIconDrag: moveDrag, endIconDrag: endDrag, cancelIconDrag: cancelDrag }
}
