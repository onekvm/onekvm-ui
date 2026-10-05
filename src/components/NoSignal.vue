<script setup lang="ts">
import { serviceURL } from '@/api/service-url'
import { t } from '@/i18n/runtime'
</script>

<template>
  <div class="no-signal" role="img" :aria-label="t('screen.noSignal', 'No signal')">
    <div class="no-signal-card">
      <img class="no-signal-brand" :src="serviceURL('/brand/onekvm-logo-primary.svg')" alt="OneKVM" />
      <svg class="no-signal-icon" viewBox="0 0 84 84" aria-hidden="true">
        <path d="M42 5 5 75h74L42 5Z" fill="#f0b429" stroke="#d89516" stroke-width="3" />
        <path d="M42 27v21m0 12v1" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="7" />
      </svg>

      <div class="no-signal-copy">
        <h2><span>{{ t('screen.noSignal', 'No signal') }}</span></h2>
        <p><span>{{ t('screen.checkIfTitle', 'Please check:') }}</span></p>
        <ol>
          <li><span>{{ t('screen.checkCableSimple', 'Cables are properly and securely connected.') }}</span></li>
          <li><span>{{ t('screen.checkSourceSimple', 'Input source device is on.') }}</span></li>
          <li><span>{{ t('screen.checkSleepSimple', 'Device is not in sleep mode.') }}</span></li>
        </ol>
      </div>
    </div>
  </div>
</template>
