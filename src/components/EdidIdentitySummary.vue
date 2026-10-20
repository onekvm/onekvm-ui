<script setup lang="ts">
import { computed } from 'vue'
import type { EDIDStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { edidCurrentSummary, edidManufacturerLabel } from '@/lib/edid'

const props = defineProps<{ status: EDIDStatus; compact?: boolean }>()
const manufacturer = computed(() => edidManufacturerLabel(props.status.summary?.manufacturer) || '—')
const mode = computed(() => edidCurrentSummary(props.status, '—'))
</script>

<template>
  <dl class="edid-identity-summary" :class="{ compact }" :aria-label="t('settings.advancedSettings.displayPage.edidCurrent', 'Current EDID')">
    <dt>{{ t('settings.advancedSettings.displayPage.edidManufacturer', 'Manufacturer') }}</dt>
    <dd>{{ manufacturer }}</dd>
    <dt>{{ t('settings.advancedSettings.displayPage.edidMonitorName', 'Monitor name') }}</dt>
    <dd>{{ status.summary?.monitor_name || '—' }}</dd>
    <dt>{{ t('settings.advancedSettings.displayPage.edidPreferred', 'Preferred mode') }}</dt>
    <dd>{{ mode }}</dd>
  </dl>
</template>

<style scoped>
.edid-identity-summary { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: baseline; gap: 8px 20px; margin: 0; padding: 12px; border-radius: var(--radius); background: var(--onekvm-surface-raised); font-size: 13px; line-height: 1.5; }
.edid-identity-summary dt { color: var(--muted-foreground); }
.edid-identity-summary dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--foreground); font-variant-numeric: tabular-nums; }
.edid-identity-summary.compact { gap: 6px 12px; padding: 8px 0; background: transparent; font-size: 12px; }
.edid-identity-summary.compact dd { text-align: right; }
</style>
