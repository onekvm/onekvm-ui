<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronUp, GripVertical } from '@/icons'
import { type PersonalizationConfig, type ToolbarIconId } from '@/api/client'
import { USB_GAMEPAD_UI_ENABLED } from '@/lib/ui-features'
import { useToolbarIconDrag } from '@/composables/useToolbarIconDrag'
import {
  defaultToolbarIcons,
  isDeviceToolbarIcon,
  isRootOnlyToolbarIcon,
  normalizeToolbarIcons,
  reorderToolbarIcon,
  setToolbarIconPlacement,
  toolbarIconCollectable,
  toolbarIconPlacement,
  toolbarIconsEqual,
  type ToolbarIconPlacement,
} from '@/lib/toolbar-icons'
import { syncToolbarIconOrder } from '@/lib/toolbar-layout'
import { toolbarIconGlyph as iconGlyph, toolbarIconLabel as iconLabel } from '@/lib/toolbar-labels'
import ToolbarFoldersSettings from '../ToolbarFoldersSettings.vue'
import { t } from '@/i18n/runtime'
const props = defineProps<{
  modelValue: PersonalizationConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PersonalizationConfig]
}>()

function update(patch: Partial<PersonalizationConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
const toolbarIcons = computed(() => normalizeToolbarIcons(props.modelValue.toolbar_icons))
const iconsCustomized = computed(() => !toolbarIconsEqual(toolbarIcons.value, defaultToolbarIcons()) || Boolean(props.modelValue.toolbar_order?.length))
const { dragId, previewIcons, startIconDrag, moveIconDrag, endIconDrag, cancelIconDrag } = useToolbarIconDrag(
  () => toolbarIcons.value,
  () => props.disabled,
  updateToolbarIcons,
)
const iconGroups = computed(() => [
  {
    id: 'device',
    title: t('settings.advancedSettings.personalizationPage.deviceIcons', 'Device status'),
    icons: previewIcons.value.filter(icon => isDeviceToolbarIcon(icon.id) && (icon.id !== 'gamepad' || USB_GAMEPAD_UI_ENABLED)),
  },
  {
    id: 'action',
    title: t('settings.advancedSettings.personalizationPage.actionIcons', 'Actions'),
    icons: previewIcons.value.filter(icon => !isDeviceToolbarIcon(icon.id)),
  },
])
function updateToolbarIcons(toolbar_icons: ReturnType<typeof normalizeToolbarIcons>) {
  update({ toolbar_icons, toolbar_order: syncToolbarIconOrder(props.modelValue.toolbar_order, toolbar_icons) })
}

function iconNeighbor(id: ToolbarIconId, direction: -1 | 1) {
  const group = iconGroups.value.find(item => item.icons.some(icon => icon.id === id))
  const index = group?.icons.findIndex(icon => icon.id === id) ?? -1
  return index < 0 ? undefined : group?.icons[index + direction]
}

function moveIcon(id: ToolbarIconId, direction: -1 | 1) {
  const target = iconNeighbor(id, direction)
  if (!target || props.disabled) return
  updateToolbarIcons(reorderToolbarIcon(toolbarIcons.value, id, target.id))
}

function placeIcon(id: ToolbarIconId, placement: ToolbarIconPlacement) {
  update({ toolbar_icons: setToolbarIconPlacement(toolbarIcons.value, id, placement) })
}

function placementOptions(id: ToolbarIconId) {
  const label = (placement: ToolbarIconPlacement) => t(`settings.advancedSettings.personalizationPage.iconPlacements.${placement}`, placement)
  return (['toolbar', 'collection', 'hidden'] as const)
    .filter(placement => placement !== 'collection' || toolbarIconCollectable(id))
    .map(placement => ({ value: placement, label: label(placement) }))
}

function resetIcons() {
  update({ toolbar_icons: defaultToolbarIcons(), toolbar_order: [] })
}
</script>

<template>
  <div class="personalization-tab-content">
    <section class="personalization-section">
      <header class="personalization-section-heading">
        <div>
          <h2>{{ t('settings.advancedSettings.personalizationPage.toolbarIcons', 'Toolbar icons') }}</h2>
          <p>{{ t('settings.advancedSettings.personalizationPage.toolbarIconsHint', 'Drag to reorder icons, or hold Shift and drag them directly on the toolbar. Hidden controls remain available in the keyboard or collection menu. Settings stays visible.') }}</p>
        </div>
        <n-button size="small" quaternary :disabled="disabled || !iconsCustomized" @click="resetIcons">
          {{ t('settings.advancedSettings.personalizationPage.resetIcons', 'Reset') }}
        </n-button>
      </header>
      <div class="personalization-switch-row">
        <label id="toolbar-show-labels">{{ t('toolbar.folders.showLabels', 'Show text') }}</label>
        <n-switch :value="modelValue.toolbar_show_labels ?? false" :disabled="disabled" aria-labelledby="toolbar-show-labels" @update:value="update({ toolbar_show_labels: $event })" />
      </div>
      <n-form-item v-if="modelValue.toolbar_show_labels" class="toolbar-label-position-field" :label="t('toolbar.folders.labelPosition', 'Text position')">
        <n-radio-group :value="modelValue.toolbar_label_position ?? 'right'" :disabled="disabled" :aria-label="t('toolbar.folders.labelPosition', 'Text position')" @update:value="update({ toolbar_label_position: $event })">
          <n-radio-button v-for="position in (['top', 'bottom', 'left', 'right'] as const)" :key="position" :value="position">{{ t(`toolbar.folders.labelPositions.${position}`, position) }}</n-radio-button>
        </n-radio-group>
      </n-form-item>
      <div class="personalization-icon-groups">
        <div v-for="group in iconGroups" :key="group.id" class="personalization-icon-group">
          <h3>{{ group.title }}</h3>
          <TransitionGroup
            name="personalization-icon-sort"
            tag="div"
            class="personalization-icon-list"
            role="list"
            @pointermove="moveIconDrag"
            @pointerup="endIconDrag"
            @pointercancel="cancelIconDrag"
            @lostpointercapture="cancelIconDrag"
          >
            <div
              v-for="(icon, index) in group.icons"
              :key="icon.id"
              class="personalization-icon-row"
              :class="{ 'is-hidden': icon.hidden, 'is-dragging': dragId === icon.id }"
              role="listitem"
              :data-toolbar-icon="icon.id"
              :data-icon-group="group.id"
            >
              <button
                type="button"
                class="personalization-icon-drag"
                :disabled="disabled"
                :aria-label="t('settings.firewall.drag', 'Drag to reorder')"
                @pointerdown="startIconDrag($event, icon.id)"
              >
                <GripVertical :size="16" />
              </button>
              <span class="personalization-icon-glyph" aria-hidden="true"><component :is="iconGlyph[icon.id]" :size="18" /></span>
              <strong>{{ iconLabel(icon.id) }}</strong>
              <span class="personalization-icon-moves">
                <button type="button" class="personalization-icon-move" :disabled="disabled || index === 0" :aria-label="t('settings.advancedSettings.personalizationPage.moveUp', 'Move up')" @click="moveIcon(icon.id, -1)">
                  <ChevronUp :size="16" />
                </button>
                <button type="button" class="personalization-icon-move" :disabled="disabled || index === group.icons.length - 1" :aria-label="t('settings.advancedSettings.personalizationPage.moveDown', 'Move down')" @click="moveIcon(icon.id, 1)">
                  <ChevronDown :size="16" />
                </button>
              </span>
              <n-select
                class="personalization-icon-placement"
                size="small"
                :value="toolbarIconPlacement(toolbarIcons, icon.id)"
                :options="placementOptions(icon.id)"
                :disabled="disabled || isRootOnlyToolbarIcon(icon.id)"
                :consistent-menu-width="false"
                :aria-label="t('settings.advancedSettings.personalizationPage.iconPlacement', 'Where {name} appears').replace('{name}', iconLabel(icon.id))"
                @update:value="placeIcon(icon.id, $event)"
              />
            </div>
          </TransitionGroup>
        </div>
      </div>
      <ToolbarFoldersSettings :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
    </section>
  </div>
</template>

<style scoped>
.toolbar-label-position-field { margin-top: 16px; }
.personalization-icon-groups { display: grid; gap: 16px; }
.personalization-icon-group { display: grid; gap: 8px; }
.personalization-icon-group h3 { margin: 0; color: var(--muted-foreground); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.personalization-icon-list { position: relative; display: grid; gap: 6px; }
.personalization-icon-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto auto; align-items: center; gap: 8px; min-height: 44px; padding: 4px 10px 4px 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
.personalization-icon-row.is-hidden { background: var(--onekvm-surface-inset); }
.personalization-icon-row.is-hidden strong { color: var(--muted-foreground); }
.personalization-icon-row.is-dragging { opacity: .3; border-color: var(--primary); }
.personalization-icon-row.is-drag-ghost { border-color: var(--primary); box-shadow: var(--onekvm-shadow-popover); }
.personalization-icon-sort-move { transition: transform 180ms var(--win11-ease-out); }
.personalization-icon-row strong { overflow: hidden; color: var(--foreground); font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.personalization-icon-glyph { display: grid; width: 28px; height: 28px; place-items: center; color: var(--foreground); }
.personalization-icon-drag, .personalization-icon-move { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted-foreground); }
.personalization-icon-drag { cursor: grab; touch-action: none; }
.personalization-icon-drag:active { cursor: grabbing; }
.personalization-icon-drag:disabled, .personalization-icon-move:disabled { cursor: default; opacity: 0.4; }
.personalization-icon-move:not(:disabled):hover, .personalization-icon-drag:not(:disabled):hover { background: var(--secondary); color: var(--foreground); }
.personalization-icon-moves { display: flex; }
.personalization-icon-placement { justify-self: end; width: 116px; }
@media (max-width: 720px) {
  .personalization-icon-drag, .personalization-icon-move { width: 44px; height: 44px; }
}
@media (max-width: 520px) {
  .personalization-icon-row { grid-template-columns: auto auto minmax(0, 1fr) auto; row-gap: 2px; padding-bottom: 8px; }
  .personalization-icon-placement { grid-column: 3 / -1; justify-self: stretch; width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .personalization-icon-sort-move { transition: none; }
}
</style>
