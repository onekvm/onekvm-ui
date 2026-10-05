<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'

import { t } from '@/i18n/runtime'

import { useOverlayMount } from '@/composables/useOverlayMount'

const overlayTo = useOverlayMount()
const CHECK_INTERVAL_MS = 60_000
const ENTRY_ASSET_PATTERN = /\/assets\/index-[^/?#]+\.js$/

const updateAvailable = ref(false)
let loadedEntry = ''
let checking: Promise<void> | null = null
let checkTimer = 0

function entryAsset(documentValue: Document, baseURL: string) {
  for (const script of Array.from(documentValue.scripts)) {
    const source = script.getAttribute('src')
    if (!source) continue
    const url = new URL(source, baseURL)
    if (ENTRY_ASSET_PATTERN.test(url.pathname)) return `${url.origin}${url.pathname}${url.search}`
  }
  return ''
}

function latestIndexURL() {
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.set('_onekvm_ui_check', String(Date.now()))
  return url
}

async function performCheck() {
  if (!loadedEntry || updateAvailable.value) return
  try {
    const url = latestIndexURL()
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    })
    if (!response.ok) return
    const latestDocument = new DOMParser().parseFromString(await response.text(), 'text/html')
    const latestEntry = entryAsset(latestDocument, url.href)
    if (latestEntry && latestEntry !== loadedEntry) updateAvailable.value = true
  } catch {
    // Connection errors are handled by the console. Check again after focus or the next interval.
  }
}

function checkForUpdate() {
  if (checking || updateAvailable.value) return checking
  checking = performCheck().finally(() => { checking = null })
  return checking
}

function checkWhenVisible() {
  if (document.visibilityState === 'visible') void checkForUpdate()
}

function handleWindowError(event: Event) {
  const target = event.target
  if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
    const source = target instanceof HTMLScriptElement ? target.src : target.href
    if (source.includes('/assets/')) void checkForUpdate()
  }
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason || '')
  if (/dynamically imported module|module script|loading chunk|failed to fetch/i.test(message)) {
    void checkForUpdate()
  }
}

function reloadLatestUI() {
  const url = new URL(window.location.href)
  url.searchParams.set('_onekvm_ui_reload', String(Date.now()))
  window.location.replace(url)
}

onMounted(() => {
  loadedEntry = entryAsset(document, window.location.href)
  void checkForUpdate()
  checkTimer = window.setInterval(checkWhenVisible, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('focus', checkWhenVisible)
  window.addEventListener('pageshow', checkWhenVisible)
  window.addEventListener('error', handleWindowError, true)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
})

onBeforeUnmount(() => {
  window.clearInterval(checkTimer)
  document.removeEventListener('visibilitychange', checkWhenVisible)
  window.removeEventListener('focus', checkWhenVisible)
  window.removeEventListener('pageshow', checkWhenVisible)
  window.removeEventListener('error', handleWindowError, true)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
})
</script>

<template>
  <n-modal
    :show="updateAvailable"
    :to="overlayTo"
    preset="card"
    class="ui-update-modal"
    :title="t('settings.uiUpdate.title', 'OneKVM was updated')"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :auto-focus="false"
  >
    <p>{{ t('settings.uiUpdate.description', 'A newer web interface is installed. Reload before continuing to avoid mixing old and new UI resources.') }}</p>
    <template #footer>
      <n-button type="primary" block @click="reloadLatestUI">
        <template #icon><RefreshCw /></template>
        {{ t('settings.uiUpdate.reload', 'Reload now') }}
      </n-button>
    </template>
  </n-modal>
</template>

<style>
.ui-update-modal { width: min(440px, calc(100vw - 32px)); }
.ui-update-modal p { margin: 0; color: var(--muted-foreground); line-height: 1.7; }
</style>
