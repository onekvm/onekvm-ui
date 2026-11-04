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
const sequence = computed(() => {
  const hint = magicHint.value
  if (!hint.active || hint.playing) return ''
  const chords = hint.sequence?.length ? hint.sequence : hint.codes.length ? [hint.codes] : []
  return chords.map((step) => typeof step === 'number'
    ? `${step} ms`
    : step.map((code) => chordKeyLabel(code, names.value)).join(' + ')).join(' → ')
})
const instruction = computed(() => {
  if (magicHint.value.playing) return t('keyboard.magicOverlaySending', 'Sending · Esc to cancel')
  return sequence.value
    ? t('keyboard.magicOverlaySend', 'Double-tap Magic Key to send · Esc to cancel')
    : t('keyboard.magicOverlayWait', 'Enter keys · Tap Magic Key for a 100 ms pause · Esc to cancel')
})
</script>

<template>
  <div v-if="magicHint.active" class="keyboard-magic-hint" role="status" aria-live="polite">
    <div v-if="sequence" class="keyboard-magic-sequence">{{ sequence }}</div>
    <div>{{ instruction }}</div>
  </div>
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
  transform: translateX(-50%);
  white-space: normal;
}

.keyboard-magic-sequence {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
