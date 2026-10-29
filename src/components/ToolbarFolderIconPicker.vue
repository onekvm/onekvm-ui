<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { NVirtualList } from 'naive-ui'
import { Folder, iconComponent, icons } from '@/icons'
import { activeIconSet } from '@/icons/runtime'
import { canonicalIconName } from '@/icons/defaults'
import { t } from '@/i18n/runtime'

const props = defineProps<{ value: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:value': [value: string] }>()
const query = shallowRef('')
const list = shallowRef<InstanceType<typeof NVirtualList> | null>(null)
const names = computed(() => {
  const available = new Map(Object.keys(icons).map(name => [canonicalIconName(name), name]))
  for (const name of Object.keys(activeIconSet.value.icons)) {
    if (!available.has(name)) available.set(name, name)
  }
  return [...available.values()].sort((a, b) => a.localeCompare(b))
})
const filtered = computed(() => {
  const search = query.value.trim().toLowerCase().replace(/[\s-]/g, '')
  return names.value.filter(name => name.toLowerCase().replace(/-/g, '').includes(search)
    || t(`toolbar.folders.icons.${name}`, name).toLowerCase().includes(search))
})
const rows = computed(() => Array.from({ length: Math.ceil(filtered.value.length / 6) }, (_, index) => ({ key: index, names: filtered.value.slice(index * 6, index * 6 + 6) })))
const selected = computed(() => iconComponent(props.value) || Folder)
watch(query, () => list.value?.scrollTo({ top: 0 }))
</script>

<template>
  <div class="toolbar-folder-icon-picker">
    <div class="toolbar-folder-icon-search">
      <component :is="selected" :size="22" aria-hidden="true" />
      <n-input v-model:value="query" clearable :disabled="disabled" :placeholder="t('toolbar.folders.searchIcons', 'Search icons')" :input-props="{ 'aria-label': t('toolbar.folders.searchIcons', 'Search icons') }" />
    </div>
    <NVirtualList v-if="rows.length" ref="list" :items="rows" :item-size="44" style="height: 220px" :aria-label="t('toolbar.folders.icon', 'Folder icon')">
      <template #default="{ item }">
        <div class="toolbar-folder-icon-row">
          <n-button v-for="name in item.names" :key="name" :type="canonicalIconName(value) === canonicalIconName(name) ? 'primary' : 'default'" :secondary="canonicalIconName(value) === canonicalIconName(name)" :disabled="disabled" :title="t(`toolbar.folders.icons.${name}`, name)" :aria-label="t(`toolbar.folders.icons.${name}`, name)" :aria-pressed="canonicalIconName(value) === canonicalIconName(name)" @click="emit('update:value', name)">
            <template #icon><component :is="iconComponent(name) || Folder" aria-hidden="true" /></template>
          </n-button>
        </div>
      </template>
    </NVirtualList>
    <p v-else class="toolbar-folder-icon-empty">{{ t('toolbar.folders.noIcons', 'No matching icons') }}</p>
  </div>
</template>

<style scoped>
.toolbar-folder-icon-picker { width: 100%; }
.toolbar-folder-icon-search { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.toolbar-folder-icon-search > :first-child { flex-shrink: 0; }
.toolbar-folder-icon-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; height: 44px; padding-right: 10px; }
.toolbar-folder-icon-row :deep(.n-button) { width: 100%; height: 40px; padding: 0; }
.toolbar-folder-icon-row :deep(.n-button__icon) { margin: 0; }
.toolbar-folder-icon-empty { height: 220px; margin: 0; display: grid; place-items: center; color: var(--muted-foreground); }
</style>
