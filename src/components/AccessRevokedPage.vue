<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watchEffect } from 'vue'

import { serviceURL } from '@/api/service-url'
import { ChevronDown, Languages } from '@/icons'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'

const logoSource = serviceURL('/brand/onekvm-logo-primary.svg')
const previousTitle = document.title
const languageMenuOpen = shallowRef(false)
const languageBusy = shallowRef(false)
const languageError = shallowRef(false)
const languageMenuOptions = languageOptions.map(({ label, value }) => ({ label, key: value }))
const languageLabel = computed(() => languageOptions.find(({ value }) => value === currentLanguage.value)?.label || 'English')

async function selectLanguage(key: string | number) {
  if (languageBusy.value) return
  languageMenuOpen.value = false
  languageBusy.value = true
  languageError.value = false
  try {
    await setLanguage(String(key))
  } catch {
    languageError.value = true
  } finally {
    languageBusy.value = false
  }
}

watchEffect(() => {
  document.title = `${t('accessRevoked.title')} · OneKVM`
})

onUnmounted(() => {
  document.title = previousTitle
})
</script>

<template>
  <main class="access-notice" :aria-label="t('accessRevoked.title')">
    <article class="access-letter">
      <header class="access-letter-header">
        <svg class="access-letter-logo" viewBox="106 74 1114 257" role="img" aria-label="OneKVM">
          <image :href="logoSource" width="1400" height="400" />
        </svg>
        <n-dropdown
          v-model:show="languageMenuOpen"
          trigger="click"
          placement="bottom-end"
          :options="languageMenuOptions"
          @select="selectLanguage"
        >
          <button
            class="access-language-button"
            type="button"
            :disabled="languageBusy"
            :aria-busy="languageBusy"
            :aria-label="`${t('accessRevoked.language')}: ${languageLabel}`"
            aria-haspopup="menu"
            :aria-expanded="languageMenuOpen"
          >
            <Languages class="access-language-icon" aria-hidden="true" />
            <span>{{ languageLabel }}</span>
            <ChevronDown class="access-language-icon" aria-hidden="true" />
          </button>
        </n-dropdown>
      </header>

      <div class="access-letter-body">
        <p v-if="languageError" class="access-language-error" role="alert">{{ t('accessRevoked.languageFailed') }}</p>
        <p class="access-letter-paragraph">{{ t('accessRevoked.greeting') }}</p>
        <p class="access-letter-paragraph">{{ t('accessRevoked.reason') }}</p>
        <p class="access-letter-paragraph">
          {{ t('accessRevoked.appeal') }}<a class="access-letter-link" href="https://onekvm.org" target="_blank" rel="noopener noreferrer">{{ t('accessRevoked.learnMore') }}</a>{{ t('accessRevoked.period') }}
        </p>
        <footer class="access-letter-signature">
          <p class="access-letter-paragraph">{{ t('accessRevoked.regards') }}</p>
          <p class="access-letter-paragraph">OneKVM Linux</p>
        </footer>
      </div>
    </article>
  </main>
</template>

<style scoped>
/* Keep the reference's paper panel in every UI theme. */
.access-notice {
  --notice-canvas: #faf9f6;
  --notice-paper: #fff;
  --notice-ink: #3f3e32;
  --notice-panel-border: rgb(63 62 50 / 12%);
  --notice-panel-shadow: 0 8px 32px rgb(63 62 50 / 4%);
  --notice-link-hover: #2563eb;
  --notice-focus: #061a3a;
  --notice-control-hover: rgb(63 62 50 / 5%);
  --notice-error: #b91c1c;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 48px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  color-scheme: light;
  color: var(--notice-ink);
  background: var(--notice-canvas);
  font-family: Arial, 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.access-letter {
  flex: none;
  width: min(100%, 720px);
  margin: auto;
  padding: 48px 56px;
  border: 1px solid var(--notice-panel-border);
  border-radius: 24px;
  background: var(--notice-paper);
  box-shadow: var(--notice-panel-shadow);
}

.access-letter-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 40px;
}

.access-letter-logo {
  display: block;
  width: 176px;
  max-width: 100%;
  height: auto;
}

.access-language-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  margin-left: auto;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  color: var(--notice-ink);
  background: transparent;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.access-language-button:hover,
.access-language-button:active {
  background: var(--notice-control-hover);
}

.access-language-button:focus-visible {
  outline: 2px solid var(--notice-focus);
  outline-offset: 2px;
}

.access-language-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.access-language-icon {
  width: 16px;
  height: 16px;
}

.access-language-error {
  margin: 0;
  color: var(--notice-error);
  font-size: 14px;
}

.access-letter-body {
  display: grid;
  gap: 20px;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.75;
  overflow-wrap: break-word;
}

.access-letter-paragraph {
  margin: 0;
}

.access-letter-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 4px;
}

.access-letter-link:hover,
.access-letter-link:active {
  color: var(--notice-link-hover);
}

.access-letter-link:focus-visible {
  outline: 2px solid var(--notice-focus);
  outline-offset: 4px;
  border-radius: 2px;
}

.access-letter-signature {
  display: grid;
  gap: 20px;
}

@media (max-width: 600px) {
  .access-notice {
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }

  .access-letter {
    padding: 32px 24px;
    border-radius: 20px;
  }

  .access-letter-header {
    margin-bottom: 32px;
  }

  .access-letter-logo {
    width: 152px;
  }

  .access-letter-body {
    font-size: 16px;
  }
}
</style>
