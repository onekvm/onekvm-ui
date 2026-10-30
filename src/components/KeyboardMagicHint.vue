<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { chordKeyLabel, clientModifierNames, magicHint, type ChordNameSet } from '@/lib/keyboard-magic'

const client = clientModifierNames()
const names = computed<ChordNameSet>(() => ({
  alt: client.alt,
  left: t('keyboard.magicSideLeft', 'Left'),
  menu: t('keyboard.magicMenu', 'Menu'),
  meta: client.meta,
  off: t('keyboard.magicOff', 'Off'),
  right: t('keyboard.magicSideRight', 'Right'),
}))
const text = computed(() => {
  const hint = magicHint.value
  if (!hint.active) return ''
  if (!hint.codes.length) return t('keyboard.magicOverlayWait', 'Press the shortcut to send')
  return hint.codes.map((code) => chordKeyLabel(code, names.value)).join(' + ')
})
</script>

<template>
  <div v-if="text" class="keyboard-magic-hint" role="status" aria-live="polite">{{ text }}</div>
</template>

<style scoped>
.keyboard-magic-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 4;
  max-width: min(440px, calc(100% - 32px));
  padding: 8px 12px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--onekvm-surface-overlay);
  box-shadow: var(--onekvm-shadow-popover);
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
  text-align: center;
  text-overflow: ellipsis;
  transform: translateX(-50%);
  white-space: nowrap;
}
</style>
