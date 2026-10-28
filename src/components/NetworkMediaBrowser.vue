<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Disc3, Folder, HardDrive, House, Link, LoaderCircle, RefreshCw, Server, Unplug } from '@/icons'
import { api, type MSDMedia, type MSDSource, type MSDSourceListing } from '@/api/client'
import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { mediaSourceTabsTheme } from '@/lib/media-source-tabs'

const props = defineProps<{
  kind: MSDMedia['kind']
  sources: MSDSource[]
  refreshing: boolean
  revision: number
  mountedId: string
  mountingId: string | null
  blocked: boolean
  connected: boolean
  connecting: boolean
}>()
const emit = defineEmits<{ mount: [media: MSDMedia]; eject: []; refresh: []; connect: [] }>()
const overlayTo = useOverlayMount()
const tooltipStyle = { maxWidth: 'min(600px, calc(100vw - 32px))', overflowWrap: 'anywhere' }
const selectedKey = ref('')
const path = ref('')
const listing = ref<MSDSourceListing | null>(null)
const loading = ref(false)
const error = ref('')
let controller: AbortController | null = null
const sourceKey = (source: MSDSource) => `${source.extension}/${source.directory}`
const selected = computed(() => props.sources.find(source => sourceKey(source) === selectedKey.value))
const breadcrumbs = computed(() => path.value ? path.value.split('/') : [])
const networkMounted = computed(() => props.mountedId.startsWith('external-'))
const sizeLabel = (size: number) => size >= 1024 ** 3
  ? `${(size / 1024 ** 3).toFixed(1)} GiB`
  : `${(size / 1024 ** 2).toFixed(1)} MiB`

function choose(key: string) {
  path.value = ''
  selectedKey.value = key
}

watch(() => props.sources, sources => {
  if (!sources.some(source => sourceKey(source) === selectedKey.value)) {
    path.value = ''
    selectedKey.value = sources.length ? sourceKey(sources[0]!) : ''
  }
}, { immediate: true })

async function load() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  listing.value = null
  error.value = ''
  loading.value = false
  const source = selected.value
  if (!source?.available) return
  loading.value = true
  try {
    const result = await api.browseMSDSource(source, path.value, props.kind, request.signal)
    if (!request.signal.aborted) listing.value = result
  } catch (cause) {
    if (!request.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (controller === request) loading.value = false
  }
}

watch([selectedKey, path, () => props.revision, () => props.mountedId], () => { void load() }, { immediate: true })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="network-media" :aria-label="t('virtualMedia.networkShares')">
    <header>
      <strong><Server :size="16" />{{ t('virtualMedia.networkShares') }}</strong>
      <n-button quaternary circle size="small" :loading="loading || refreshing" :aria-label="t('common.refresh', 'Refresh')" @click="emit('refresh')"><template #icon><RefreshCw /></template></n-button>
    </header>
    <n-tabs :value="selectedKey" type="line" size="small" :bar-width="24" :theme-overrides="mediaSourceTabsTheme" class="source-tabs host-tabs" :aria-label="t('virtualMedia.networkShares')" @update:value="choose">
      <n-tab v-for="source in sources" :key="sourceKey(source)" :name="sourceKey(source)">
        <span class="source-tab"><Server :size="16" />{{ source.name }}</span>
      </n-tab>
    </n-tabs>
    <small class="source-hint">{{ t('virtualMedia.networkReadOnly') }}</small>
    <n-alert v-if="!connected" type="info" :bordered="false" class="source-connect">
      <div class="source-connect-content">
        <span>{{ t('virtualMedia.pleaseConnect', 'Connect virtual media before exposing it to the host.') }}</span>
        <n-button size="small" type="primary" :loading="connecting" @click="emit('connect')"><template #icon><Link /></template>{{ connecting ? t('virtualMedia.connecting', 'Connecting') : t('virtualMedia.connect', 'Connect') }}</n-button>
      </div>
    </n-alert>
    <div v-if="networkMounted" class="network-mounted">
      <span>{{ t('virtualMedia.networkMounted') }}</span>
      <n-button size="small" @click="emit('eject')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
    </div>
    <nav class="source-path" :aria-label="t('virtualMedia.rootDirectory', 'Root')">
      <n-button text :disabled="!path" @click="path = ''"><template #icon><House /></template>{{ t('virtualMedia.rootDirectory', 'Root') }}</n-button>
      <template v-for="(part, index) in breadcrumbs" :key="index">
        <span>/</span><n-button text :disabled="index === breadcrumbs.length - 1" @click="path = breadcrumbs.slice(0, index + 1).join('/')">{{ part }}</n-button>
      </template>
    </nav>
    <div v-if="loading" class="source-status" role="status"><LoaderCircle class="spin" :size="18" />{{ t('virtualMedia.loadingSource') }}</div>
    <n-alert v-else-if="error" type="error">{{ error }} <n-button text @click="load">{{ t('common.retry', 'Retry') }}</n-button></n-alert>
    <div v-else-if="!selected?.available" class="source-status">{{ t('virtualMedia.sourceUnavailable') }}</div>
    <template v-else-if="listing">
      <n-alert v-if="listing.truncated" type="warning">{{ t('virtualMedia.sourceTruncated') }}</n-alert>
      <div class="source-list">
        <div v-if="!listing.entries.some(entry => !entry.directory)" class="source-hint">
          {{ t(kind === 'iso' ? 'virtualMedia.sourceEmptyISO' : 'virtualMedia.sourceEmptyDrive') }}
        </div>
        <div v-for="entry in listing.entries" :key="entry.path" class="source-row">
          <n-tooltip v-if="entry.directory" :to="overlayTo" :z-index="4700" :delay="250" :style="tooltipStyle">
            <template #trigger><button class="source-folder" type="button" @click="path = entry.path"><Folder :size="20" /><span>{{ entry.name }}</span></button></template>
            {{ entry.name }}
          </n-tooltip>
          <template v-else-if="entry.media">
            <component :is="kind === 'iso' ? Disc3 : HardDrive" :size="20" />
            <div class="source-file">
              <n-tooltip :to="overlayTo" :z-index="4700" :delay="250" :style="tooltipStyle"><template #trigger><strong>{{ entry.name }}</strong></template>{{ entry.name }}</n-tooltip>
              <small>{{ sizeLabel(entry.media.size) }}</small>
            </div>
            <n-tag v-if="entry.media.id === mountedId" type="success" size="small">{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
            <n-button v-else size="small" type="primary" :loading="mountingId === entry.media.id" :disabled="blocked || Boolean(mountedId) || Boolean(mountingId && mountingId !== entry.media.id)" @click="emit('mount', entry.media)">{{ mountingId === entry.media.id ? t('virtualMedia.mounting', 'Mounting') : t('virtualMedia.mount', 'Mount') }}</n-button>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.network-media { display: grid; gap: 10px; padding: 12px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 8px; min-width: 0; }
.network-media header, .network-media header strong, .network-mounted { display: flex; align-items: center; gap: 8px; }
.network-media header, .network-mounted { justify-content: space-between; }
.source-tabs { min-width: 0; }
.source-tab { display: inline-flex; align-items: center; gap: 6px; }
.source-tab svg { flex-shrink: 0; }
.source-connect-content { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.source-path { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.source-path :deep(.n-button__content) { overflow-wrap: anywhere; white-space: normal; text-align: left; }
.source-hint, .source-file small { color: var(--muted-foreground); font-size: 12px; }
.source-status { display: flex; align-items: center; gap: 8px; padding: 12px 0; }
.source-list { max-height: 240px; overflow: auto; min-width: 0; }
.source-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: start; gap: 8px; min-height: 38px; padding: 4px 0; }
.source-row > svg, .source-folder > svg { justify-self: center; align-self: start; margin-top: 1px; }
.source-row > :deep(.n-button), .source-row > :deep(.n-tag) { align-self: center; }
.source-folder { display: grid; grid-template-columns: 24px minmax(0, 1fr); grid-column: 1 / -1; align-items: start; gap: 8px; width: 100%; min-width: 0; padding: 6px 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
.source-folder:hover { background: var(--muted); }
.source-folder:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.source-folder svg { flex-shrink: 0; }
.source-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-file { display: grid; gap: 2px; flex: 1; min-width: 0; }
.source-file strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.spin { animation: source-spin 1s linear infinite; }
@keyframes source-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
