<script setup lang="ts">
import { ArrowBigUpDash, ArrowDownUp, Hash, LockKeyhole, LockKeyholeOpen } from '@lucide/vue'

import { useOverlayMount } from '@/composables/useOverlayMount'
import type { KeyboardLock, KeyboardLockChange } from '@/lib/keyboard-lock-state'
import { t } from '@/i18n/runtime'

defineProps<{ changes: readonly KeyboardLockChange[] }>()

const overlayTo = useOverlayMount()
const icons = { capsLock: ArrowBigUpDash, numLock: Hash, scrollLock: ArrowDownUp }
const names: Record<KeyboardLock, string> = { capsLock: 'Caps Lock', numLock: 'Num Lock', scrollLock: 'Scroll Lock' }
</script>

<template>
  <Teleport :to="overlayTo">
    <div class="keyboard-lock-overlay-anchor" role="status" aria-live="polite" aria-atomic="true">
      <Transition name="keyboard-lock-overlay">
        <div v-if="changes.length" class="keyboard-lock-overlay">
          <div v-for="change in changes" :key="change.lock" class="keyboard-lock-overlay-row" :class="{ 'is-on': change.on }">
            <div class="keyboard-lock-overlay-icon" aria-hidden="true">
              <component :is="icons[change.lock]" :size="32" :stroke-width="1.8" />
              <component :is="change.on ? LockKeyhole : LockKeyholeOpen" class="keyboard-lock-overlay-badge" :size="18" :stroke-width="2" />
            </div>
            <div class="keyboard-lock-overlay-copy">
              <div class="keyboard-lock-overlay-name">{{ t(`keyboard.${change.lock}`, names[change.lock]) }}</div>
              <div class="keyboard-lock-overlay-state">{{ change.on ? t('keyboard.lockOn', 'On') : t('keyboard.lockOff', 'Off') }}</div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.keyboard-lock-overlay-anchor {
  position: fixed;
  inset-inline: 16px;
  bottom: calc(clamp(64px, 10vh, 96px) + env(safe-area-inset-bottom, 0px));
  z-index: 4500;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.keyboard-lock-overlay {
  display: grid;
  gap: 16px;
  min-width: 208px;
  max-width: 100%;
  padding: 18px 24px;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--onekvm-surface-overlay);
  color: var(--foreground);
  box-shadow: var(--onekvm-shadow-popover);
  backdrop-filter: blur(16px);
}

.keyboard-lock-overlay-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.keyboard-lock-overlay-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  color: var(--onekvm-text-secondary);
}

.keyboard-lock-overlay-badge {
  position: absolute;
  right: -3px;
  bottom: -1px;
  border-radius: 4px;
  background: var(--popover);
}

.is-on .keyboard-lock-overlay-icon {
  color: var(--primary-hover);
}

.keyboard-lock-overlay-copy { min-width: 0; }
.keyboard-lock-overlay-name { font-size: 14px; font-weight: 500; line-height: 1.4; }
.keyboard-lock-overlay-state { margin-top: 2px; font-size: 16px; font-weight: 600; line-height: 1.4; }

.keyboard-lock-overlay-enter-active { transition: opacity 140ms ease-out, transform 140ms ease-out; }
.keyboard-lock-overlay-leave-active { transition: opacity 240ms ease-out, transform 240ms ease-out; }
.keyboard-lock-overlay-enter-from,
.keyboard-lock-overlay-leave-to { opacity: 0; transform: translateY(6px); }

@media (prefers-reduced-motion: reduce) {
  .keyboard-lock-overlay-enter-active,
  .keyboard-lock-overlay-leave-active { transition: none; }
}
</style>
