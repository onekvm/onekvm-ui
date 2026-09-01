<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  bytesPercent,
  errorMessage,
  firmwareProgressPercent,
  formatBytes,
  loadRecoveryStatus,
  postRecovery,
  uploadFirmware,
  type FirmwareProgress,
  RECOVERY_PATHS,
} from './api'
import {
  isRecoveryLocale,
  readRecoveryLocale,
  recoveryDocumentLang,
  recoveryLocales,
  recoveryMessages,
  RECOVERY_LOCALE_KEY,
  type RecoveryLocale,
  type RecoveryMessageKey,
} from './messages'
import {
  readRecoveryTheme,
  recoveryThemes,
  resolveRecoveryTheme,
  RECOVERY_THEME_KEY,
  type RecoveryTheme,
} from './theme'

type ConfirmKind = 'reset-user' | 'factory-reset' | 'reboot'

const LANGUAGE_LABELS: Record<RecoveryLocale, string> = {
  en: 'English',
  zh: '简体中文',
  zh_tw: '繁體中文',
}

const THEME_LABELS: Record<RecoveryTheme, RecoveryMessageKey> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
}

const locale = ref<RecoveryLocale>(
  readRecoveryLocale(
    localStorage.getItem(RECOVERY_LOCALE_KEY),
    navigator.languages?.length ? navigator.languages : [navigator.language],
  ),
)
const themePref = ref<RecoveryTheme>(readRecoveryTheme(localStorage.getItem(RECOVERY_THEME_KEY)))
const firmwareFile = ref<File | null>(null)
const busy = ref(false)
const statusText = ref('')
const statusError = ref(false)
const confirmKind = ref<ConfirmKind | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const addresses = ref<string[]>([])
const firmwareMax = ref(0)
const flashProgress = ref<FirmwareProgress | null>(null)
const dragging = ref(false)
let addressTimer = 0
let themeMedia: MediaQueryList | null = null

function onColorSchemeChange() {
  if (themePref.value === 'system') applyTheme()
}

document.documentElement.lang = recoveryDocumentLang(locale.value)

const copy = computed(() => recoveryMessages[locale.value])

function t(key: RecoveryMessageKey) {
  return copy.value[key]
}

function applyTheme() {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = resolveRecoveryTheme(themePref.value, systemDark)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#090b0e' : '#eef1f5')
}

applyTheme()

function setLocale(next: string) {
  if (!isRecoveryLocale(next)) return
  locale.value = next
  localStorage.setItem(RECOVERY_LOCALE_KEY, next)
  document.documentElement.lang = recoveryDocumentLang(next)
}

function setTheme(next: string) {
  if (next !== 'system' && next !== 'light' && next !== 'dark') return
  themePref.value = next
  localStorage.setItem(RECOVERY_THEME_KEY, next)
  applyTheme()
}

function setStatus(text: string, error: boolean) {
  statusText.value = text
  statusError.value = error
}

function takeFirmwareFile(file: File | undefined | null) {
  if (!file) return
  firmwareFile.value = file
}

function onFirmwareChange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  takeFirmwareFile(input.files?.[0] || null)
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragging.value = false
  if (busy.value) return
  takeFirmwareFile(event.dataTransfer?.files?.[0] || null)
}

async function runAction(path: (typeof RECOVERY_PATHS)[keyof typeof RECOVERY_PATHS], body?: BodyInit, pending?: RecoveryMessageKey) {
  if (busy.value) return
  busy.value = true
  if (pending) setStatus(t(pending), false)
  try {
    await postRecovery(path, body)
    setStatus(t('ok'), false)
  } catch (error) {
    setStatus(t('fail') + errorMessage(error), true)
  } finally {
    busy.value = false
  }
}

function fillPercent(key: RecoveryMessageKey, percent: number) {
  return t(key).replace('{percent}', String(percent))
}

function fillVars(key: RecoveryMessageKey, vars: Record<string, string>) {
  let text: string = t(key)
  for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, vars[name])
  return text
}

function labelFor(progress: FirmwareProgress) {
  if (progress.phase === 'upload') return fillPercent('uploading', bytesPercent(progress.received, progress.total))
  if (progress.phase === 'extract') return t('extracting')
  if (progress.phase === 'verify') return t('verifying')
  if (progress.phase === 'write-rootfs') return fillPercent('writingRoot', bytesPercent(progress.received, progress.total))
  if (progress.phase === 'write-boot') return t('writingBoot')
  if (progress.phase === 'switch') return t('switching')
  if (progress.phase === 'done') return t('ok')
  if (progress.phase === 'error') return t('fail') + (progress.message || '')
  return ''
}

const flashPercent = computed(() => (flashProgress.value ? firmwareProgressPercent(flashProgress.value) : 0))
const flashLabel = computed(() => (flashProgress.value ? labelFor(flashProgress.value) : ''))

async function flashFirmware() {
  const file = firmwareFile.value
  if (!file) {
    setStatus(t('choose'), true)
    return
  }
  if (firmwareMax.value > 0 && file.size > firmwareMax.value) {
    setStatus(fillVars('fwTooBig', { size: formatBytes(file.size), max: formatBytes(firmwareMax.value) }), true)
    return
  }
  if (busy.value) return
  busy.value = true
  flashProgress.value = { phase: 'upload', received: 0, total: file.size }
  setStatus(fillPercent('uploading', 0), false)
  try {
    await uploadFirmware(file, (progress) => {
      flashProgress.value = progress
      if (progress.phase === 'error') {
        setStatus(labelFor(progress), true)
        return
      }
      setStatus(labelFor(progress), false)
    })
    flashProgress.value = { phase: 'done' }
    setStatus(t('ok'), false)
  } catch (error) {
    const message = errorMessage(error)
    flashProgress.value = { phase: 'error', message }
    setStatus(t('fail') + message, true)
  } finally {
    busy.value = false
  }
}

function requestAction(kind: ConfirmKind) {
  if (busy.value) return
  confirmKind.value = kind
}

async function confirmAction() {
  const kind = confirmKind.value
  confirmKind.value = null
  if (kind === 'reset-user') {
    await runAction(RECOVERY_PATHS.resetUser, undefined, 'resetting')
    return
  }
  if (kind === 'factory-reset') {
    await runAction(RECOVERY_PATHS.factoryReset, undefined, 'factoryResetting')
    return
  }
  if (kind === 'reboot') await runAction(RECOVERY_PATHS.reboot, undefined, 'rebooting')
}

const confirmCopy = computed(() => {
  if (confirmKind.value === 'reboot') {
    return { title: t('rebootTitle'), body: t('confirmReboot'), danger: false }
  }
  if (confirmKind.value === 'factory-reset') {
    return { title: t('factoryTitle'), body: t('confirmFactory'), danger: true }
  }
  return { title: t('userTitle'), body: t('confirmUser'), danger: true }
})

async function refreshAddresses() {
  try {
    const status = await loadRecoveryStatus()
    addresses.value = status.addresses
    firmwareMax.value = status.firmwareMax
  } catch {
    /* keep the last known list */
  }
}

watch(locale, () => {
  document.title = `OneKVM ${t('title')}`
})

onMounted(() => {
  applyTheme()
  document.title = `OneKVM ${t('title')}`
  themeMedia = window.matchMedia('(prefers-color-scheme: dark)')
  themeMedia.addEventListener('change', onColorSchemeChange)
  void refreshAddresses()
  addressTimer = window.setInterval(() => {
    void refreshAddresses()
  }, 4000)
})

onUnmounted(() => {
  if (addressTimer) window.clearInterval(addressTimer)
  themeMedia?.removeEventListener('change', onColorSchemeChange)
})
</script>

<template>
  <main class="recovery">
    <header class="recovery-head">
      <div class="brand">
        <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#061A3A" />
          <path fill="#fff" d="M14 28 L22 16 H28 V48 H21 V30 H14 Z" />
          <path fill="#1677FF" d="M28 32 L40 16 H48 L36 32 L49 48 H40 Z" />
        </svg>
        <div>
          <p class="eyebrow">OneKVM</p>
          <h1>{{ t('title') }}</h1>
          <p class="sub">{{ t('sub') }}</p>
        </div>
      </div>
      <div class="controls">
        <label class="field">
          <span>{{ t('language') }}</span>
          <select :value="locale" :aria-label="t('language')" @change="setLocale(($event.target as HTMLSelectElement).value)">
            <option v-for="item in recoveryLocales" :key="item" :value="item">{{ LANGUAGE_LABELS[item] }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('theme') }}</span>
          <select :value="themePref" :aria-label="t('theme')" @change="setTheme(($event.target as HTMLSelectElement).value)">
            <option v-for="item in recoveryThemes" :key="item" :value="item">{{ t(THEME_LABELS[item]) }}</option>
          </select>
        </label>
      </div>
    </header>

    <ul v-if="addresses.length" class="addrs">
      <li v-for="ip in addresses" :key="ip">
        <a :href="`http://${ip}/`">{{ ip }}</a>
      </li>
    </ul>
    <p v-else class="sub waiting">{{ t('waitingAddr') }}</p>

    <section
      class="card firmware"
      :class="{ dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop="onDrop"
    >
      <h2>{{ t('fwTitle') }}</h2>
      <p>{{ t('fwHelp') }}</p>
      <p v-if="firmwareMax > 0">{{ fillVars('fwLimit', { size: formatBytes(firmwareMax) }) }}</p>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".fwup,.img,.raucb,application/octet-stream"
        @change="onFirmwareChange"
      >
      <div class="dropzone" @click="fileInput?.click()">
        <strong>{{ firmwareFile?.name || t('fwChoose') }}</strong>
        <span>{{ t('fwDrop') }}</span>
      </div>
      <div class="row">
        <button class="ghost" type="button" :disabled="busy" @click="fileInput?.click()">
          {{ t('fwChoose') }}
        </button>
        <button class="primary" type="button" :disabled="busy" @click="flashFirmware">
          {{ t('fwBtn') }}
        </button>
      </div>
      <div
        v-if="flashProgress && flashProgress.phase !== 'idle'"
        class="progress"
        role="progressbar"
        :aria-label="flashLabel"
        :aria-valuenow="flashPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-bar" :style="{ width: `${flashPercent}%` }"></div>
      </div>
      <p v-if="flashProgress?.sha256" class="hash">SHA-256 {{ flashProgress.sha256 }}</p>
    </section>

    <section class="actions">
      <article class="card">
        <h2>{{ t('userTitle') }}</h2>
        <p>{{ t('userHelp') }}</p>
        <button class="danger" type="button" :disabled="busy" @click="requestAction('reset-user')">
          {{ t('userBtn') }}
        </button>
      </article>
      <article class="card">
        <h2>{{ t('factoryTitle') }}</h2>
        <p>{{ t('factoryHelp') }}</p>
        <button class="danger" type="button" :disabled="busy" @click="requestAction('factory-reset')">
          {{ t('factoryBtn') }}
        </button>
      </article>
      <article class="card">
        <h2>{{ t('rebootTitle') }}</h2>
        <p>{{ t('rebootHelp') }}</p>
        <button class="secondary" type="button" :disabled="busy" @click="requestAction('reboot')">
          {{ t('rebootBtn') }}
        </button>
      </article>
    </section>

    <p class="status" :class="{ err: statusError }" role="status" aria-live="polite">{{ statusText }}</p>
  </main>

  <div v-if="confirmKind" class="mask" role="dialog" aria-modal="true" :aria-labelledby="`confirm-${confirmKind}`">
    <div class="dialog">
      <h2 :id="`confirm-${confirmKind}`">{{ confirmCopy.title }}</h2>
      <p>{{ confirmCopy.body }}</p>
      <div class="dialog-actions">
        <button class="ghost" type="button" @click="confirmKind = null">{{ t('cancel') }}</button>
        <button :class="confirmCopy.danger ? 'danger' : 'secondary'" type="button" @click="confirmAction">
          {{ t('confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recovery {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 3.5rem;
}

.recovery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.15rem;
}

.brand {
  display: flex;
  gap: .85rem;
  min-width: 0;
}

.mark {
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
}

.eyebrow {
  margin: 0 0 .3rem;
  color: var(--rec-link);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 .4rem;
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: -.03em;
}

.sub,
.card p {
  margin: 0;
  color: var(--rec-muted);
  line-height: 1.55;
}

.waiting { margin: 0 0 1rem; }

.controls {
  display: grid;
  gap: .55rem;
}

.field {
  display: grid;
  gap: .28rem;
  color: var(--rec-muted);
  font-size: .75rem;
}

.field select {
  min-width: 8.5rem;
  border: 1px solid var(--rec-border);
  border-radius: 8px;
  padding: .4rem .55rem;
  background: var(--rec-input);
  color: var(--rec-text);
}

.addrs {
  display: flex;
  flex-wrap: wrap;
  gap: .45rem .7rem;
  margin: 0 0 1.1rem;
  padding: 0;
  list-style: none;
}

.addrs a {
  color: var(--rec-link);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .95rem;
  text-decoration: none;
}

.card {
  margin-bottom: .9rem;
  border: 1px solid var(--rec-border);
  border-radius: 12px;
  padding: 1.05rem 1.1rem 1.15rem;
  background: var(--rec-card);
}

.firmware.dragging {
  border-color: var(--rec-primary);
  background: var(--rec-drop);
}

h2 {
  margin: 0 0 .45rem;
  font-size: .95rem;
  font-weight: 650;
}

.card p { margin-bottom: .85rem; }

.file-input { display: none; }

.dropzone {
  display: grid;
  gap: .2rem;
  margin-bottom: .85rem;
  border: 1px dashed var(--rec-border);
  border-radius: 10px;
  padding: .9rem 1rem;
  cursor: pointer;
}

.dropzone strong {
  overflow: hidden;
  font-size: .9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropzone span {
  color: var(--rec-muted);
  font-size: .8rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .6rem;
}

.actions {
  display: grid;
  gap: .9rem;
}

@media (min-width: 720px) {
  .actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
  }

  .actions .card {
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
  }

  .actions button { margin-top: auto; }
}

.progress {
  margin-top: .85rem;
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--rec-border);
}

.progress-bar {
  height: 100%;
  background: var(--rec-primary);
  transition: width 180ms linear;
}

.hash {
  margin: .55rem 0 0;
  overflow: hidden;
  color: var(--rec-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button {
  border: 0;
  border-radius: 8px;
  padding: .55rem .9rem;
  cursor: pointer;
}

button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.primary { background: var(--rec-primary); color: var(--rec-primary-text); }
.danger { background: var(--rec-danger); color: #fff; }
.secondary { background: var(--rec-border); color: var(--rec-text); }
.ghost {
  border: 1px solid var(--rec-border);
  background: transparent;
  color: var(--rec-text);
}

.status {
  min-height: 1.3em;
  margin: .4rem 2px 0;
  color: var(--rec-ok);
  white-space: pre-wrap;
}

.status.err { color: var(--rec-err); }

.mask {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: var(--rec-mask);
}

.dialog {
  width: min(24rem, 100%);
  border: 1px solid var(--rec-border);
  border-radius: 12px;
  padding: 1.15rem 1.2rem 1.05rem;
  background: var(--rec-card);
}

.dialog h2 { margin-bottom: .5rem; }
.dialog p { margin: 0 0 1rem; color: var(--rec-muted); }

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: .55rem;
}

@media (max-width: 640px) {
  .recovery-head { flex-direction: column; }
  .controls { grid-template-columns: 1fr 1fr; width: 100%; }
  .field select { min-width: 0; width: 100%; }
}
</style>
