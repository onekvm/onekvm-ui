<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { errorMessage, loadRecoveryStatus, postRecovery, RECOVERY_PATHS } from './api'
import {
  detectRecoveryLocale,
  isRecoveryLocale,
  recoveryDocumentLang,
  recoveryLocales,
  recoveryMessages,
  type RecoveryLocale,
  type RecoveryMessageKey,
} from './messages'

type ConfirmKind = 'reset-user' | 'reboot'

const LANGUAGE_LABELS: Record<RecoveryLocale, string> = {
  en: 'English',
  zh: '简体中文',
  zh_tw: '繁體中文',
}

const locale = ref<RecoveryLocale>(
  detectRecoveryLocale(navigator.languages?.length ? navigator.languages : [navigator.language]),
)
const firmwareFile = ref<File | null>(null)
const busy = ref(false)
const statusText = ref('')
const statusError = ref(false)
const confirmKind = ref<ConfirmKind | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const addresses = ref<string[]>([])
let addressTimer = 0

document.documentElement.lang = recoveryDocumentLang(locale.value)

const copy = computed(() => recoveryMessages[locale.value])

function t(key: RecoveryMessageKey) {
  return copy.value[key]
}

function setLocale(next: string) {
  if (!isRecoveryLocale(next)) return
  locale.value = next
  document.documentElement.lang = recoveryDocumentLang(next)
}

function setStatus(text: string, error: boolean) {
  statusText.value = text
  statusError.value = error
}

function onFirmwareChange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  firmwareFile.value = input.files?.[0] || null
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

async function flashFirmware() {
  const file = firmwareFile.value
  if (!file) {
    setStatus(t('choose'), true)
    return
  }
  await runAction(RECOVERY_PATHS.firmware, file, 'uploading')
}

function requestResetUser() {
  if (busy.value) return
  confirmKind.value = 'reset-user'
}

function requestReboot() {
  if (busy.value) return
  confirmKind.value = 'reboot'
}

async function confirmAction() {
  const kind = confirmKind.value
  confirmKind.value = null
  if (kind === 'reset-user') {
    await runAction(RECOVERY_PATHS.resetUser, undefined, 'resetting')
    return
  }
  if (kind === 'reboot') await runAction(RECOVERY_PATHS.reboot, undefined, 'rebooting')
}

const confirmCopy = computed(() => {
  if (confirmKind.value === 'reboot') {
    return { title: t('rebootTitle'), body: t('confirmReboot') }
  }
  return { title: t('userTitle'), body: t('confirmUser') }
})

async function refreshAddresses() {
  try {
    addresses.value = await loadRecoveryStatus()
  } catch {
    /* keep the last known list */
  }
}

onMounted(() => {
  void refreshAddresses()
  addressTimer = window.setInterval(() => {
    void refreshAddresses()
  }, 4000)
})

onUnmounted(() => {
  if (addressTimer) window.clearInterval(addressTimer)
})
</script>

<template>
  <main class="recovery">
    <header class="recovery-head">
      <div>
        <p class="eyebrow">OneKVM</p>
        <h1>{{ t('title') }}</h1>
        <p class="sub">{{ t('sub') }}</p>
        <ul v-if="addresses.length" class="addrs">
          <li v-for="ip in addresses" :key="ip">
            <a :href="`http://${ip}/`">{{ ip }}</a>
          </li>
        </ul>
        <p v-else class="sub">{{ t('waitingAddr') }}</p>
      </div>
      <label class="language">
        <span>{{ t('language') }}</span>
        <select :value="locale" :aria-label="t('language')" @change="setLocale(($event.target as HTMLSelectElement).value)">
          <option v-for="item in recoveryLocales" :key="item" :value="item">{{ LANGUAGE_LABELS[item] }}</option>
        </select>
      </label>
    </header>

    <section class="card">
      <h2>{{ t('fwTitle') }}</h2>
      <p>{{ t('fwHelp') }}</p>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".fwup,.raucb,application/octet-stream"
        @change="onFirmwareChange"
      >
      <div class="row">
        <button class="ghost" type="button" :disabled="busy" @click="fileInput?.click()">
          {{ t('fwChoose') }}
        </button>
        <span class="filename">{{ firmwareFile?.name || '—' }}</span>
        <button class="primary" type="button" :disabled="busy" @click="flashFirmware">
          {{ t('fwBtn') }}
        </button>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('userTitle') }}</h2>
      <p>{{ t('userHelp') }}</p>
      <button class="danger" type="button" :disabled="busy" @click="requestResetUser">
        {{ t('userBtn') }}
      </button>
    </section>

    <section class="card">
      <h2>{{ t('rebootTitle') }}</h2>
      <p>{{ t('rebootHelp') }}</p>
      <button class="secondary" type="button" :disabled="busy" @click="requestReboot">
        {{ t('rebootBtn') }}
      </button>
    </section>

    <p class="status" :class="{ err: statusError }" role="status" aria-live="polite">{{ statusText }}</p>
  </main>

  <div v-if="confirmKind" class="mask" role="dialog" aria-modal="true" :aria-labelledby="`confirm-${confirmKind}`">
    <div class="dialog">
      <h2 :id="`confirm-${confirmKind}`">{{ confirmCopy.title }}</h2>
      <p>{{ confirmCopy.body }}</p>
      <div class="dialog-actions">
        <button class="ghost" type="button" @click="confirmKind = null">{{ t('cancel') }}</button>
        <button :class="confirmKind === 'reboot' ? 'secondary' : 'danger'" type="button" @click="confirmAction">
          {{ t('confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recovery {
  max-width: 36rem;
  margin: 0 auto;
  padding: 2.25rem 1.25rem 3.5rem;
}

.recovery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 .35rem;
  color: #7aa8ff;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 .4rem;
  font-size: 1.45rem;
  font-weight: 650;
  letter-spacing: -.02em;
}

.sub,
.card p {
  margin: 0;
  color: #9aa4ae;
  line-height: 1.5;
}

.addrs {
  display: grid;
  gap: .25rem;
  margin: .7rem 0 0;
  padding: 0;
  list-style: none;
}

.addrs a {
  color: #7aa8ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .95rem;
  text-decoration: none;
}

.language {
  display: grid;
  gap: .3rem;
  color: #8b949e;
  font-size: .75rem;
}

.language select {
  min-width: 8.5rem;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: .4rem .55rem;
  background: #171b20;
  color: #e7ebef;
}

.card {
  margin-bottom: .9rem;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1rem 1.05rem 1.1rem;
  background: #171b20;
}

h2 {
  margin: 0 0 .45rem;
  font-size: .95rem;
  font-weight: 650;
}

.card p { margin-bottom: .9rem; }

.file-input { display: none; }

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .6rem;
}

.filename {
  flex: 1 1 8rem;
  min-width: 0;
  overflow: hidden;
  color: #c5cdd6;
  font-size: .85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button {
  border: 0;
  border-radius: 6px;
  padding: .55rem .9rem;
  cursor: pointer;
}

button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.primary { background: #1677ff; color: #fff; }
.danger { background: #8b1e1e; color: #fff; }
.secondary { background: #30363d; color: #e7ebef; }
.ghost {
  border: 1px solid #30363d;
  background: transparent;
  color: #e7ebef;
}

.status {
  min-height: 1.3em;
  margin: .4rem 2px 0;
  color: #7dcea0;
  white-space: pre-wrap;
}

.status.err { color: #ff8f8f; }

.mask {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgb(4 7 9 / 78%);
}

.dialog {
  width: min(24rem, 100%);
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1.15rem 1.2rem 1.05rem;
  background: #171b20;
}

.dialog h2 { margin-bottom: .5rem; }
.dialog p { margin: 0 0 1rem; color: #9aa4ae; }

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: .55rem;
}

@media (max-width: 640px) {
  .recovery-head { flex-direction: column; }
  .row { align-items: stretch; }
  .filename { flex-basis: 100%; }
  button { width: max-content; }
}
</style>
