<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@/icons'
import type { FirewallMatch } from '@/api/client'
import { matchFields, type MatchField } from '@/lib/firewall-matches'
import { t } from '@/i18n/runtime'

const props = withDefaults(defineProps<{
  modelValue: FirewallMatch[]
  direction: string
  readonly?: boolean
  disabled?: boolean
}>(), { readonly: false, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: FirewallMatch[]] }>()
const label = (field: string) => t(`settings.firewall.matchFields.${field}`, field)
const conditions = computed(() => [
  { value: 'eq', label: t('settings.firewall.matchEquals', 'Equals') },
  { value: 'neq', label: t('settings.firewall.matchNotEquals', 'Does not equal') },
])
const protocols = computed(() => [
  { value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' },
  { value: 'tcp-udp', label: t('settings.firewall.anyProtocol', 'TCP and UDP') },
  { value: 'icmp', label: 'ICMP' }, { value: 'icmpv6', label: 'ICMPv6' },
])
const available = computed(() => matchFields.filter(field => field !== (props.direction === 'out' ? 'in-interface' : 'out-interface')))
const canAdd = computed(() => available.value.some(field => !props.modelValue.some(item => item.field === field)))
function options(index: number) {
  return matchFields.filter(field => available.value.includes(field) || props.modelValue[index]?.field === field).map(field => ({
    value: field, label: label(field), disabled: props.modelValue.some((item, row) => row !== index && item.field === field),
  }))
}
function update(index: number, change: Partial<FirewallMatch>) {
  emit('update:modelValue', props.modelValue.map((item, row) => row === index ? { ...item, ...change } : item))
}
function setField(index: number, field: MatchField) {
  update(index, { field, operator: 'eq', value: field === 'protocol' ? 'tcp' : '' })
}
function add() {
  const field = available.value.find(field => !props.modelValue.some(item => item.field === field))
  if (field) emit('update:modelValue', [...props.modelValue, { field, operator: 'eq', value: field === 'protocol' ? 'tcp' : '' }])
}
function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, row) => row !== index))
}
function placeholder(field: string) {
  if (field.endsWith('address')) return t('settings.firewall.matchAddressPlaceholder', '192.168.1.0/24 or fd00::/8')
  if (field.endsWith('port')) return t('settings.firewall.matchPortPlaceholder', '443 or 8000:8010')
  return t('settings.firewall.matchInterfacePlaceholder', 'For example eth0')
}
function display(item: FirewallMatch) {
  return item.field === 'protocol' ? protocols.value.find(p => p.value === item.value)?.label || item.value : item.value
}
</script>

<template>
  <section class="firewall-matches" :class="{ 'is-readonly': readonly }" :aria-label="t('settings.firewall.matches', 'Match')">
    <header v-if="!readonly" class="match-heading">
      <strong>{{ t('settings.firewall.matches', 'Match') }}</strong>
      <n-button size="small" :disabled="disabled || !canAdd" @click="add">
        <template #icon><Plus :size="14" /></template>
        {{ t('settings.firewall.addMatch', 'Add match') }}
      </n-button>
    </header>
    <p v-if="!readonly && modelValue.length" class="match-hint">{{ t('settings.firewall.matchesAll', 'All matches in this rule must be satisfied.') }}</p>
    <p v-if="!modelValue.length" class="match-hint">{{ t('settings.firewall.matchesAny', 'No matches: this rule applies to all traffic in its direction.') }}</p>
    <div v-else class="match-scroll">
      <table class="match-table">
        <thead><tr>
          <th scope="col">{{ t('settings.firewall.matchField', 'Field') }}</th>
          <th scope="col">{{ t('settings.firewall.matchCondition', 'Condition') }}</th>
          <th scope="col">{{ t('settings.firewall.matchValue', 'Value') }}</th>
          <th v-if="!readonly" scope="col"><span class="match-sr-only">{{ t('settings.firewall.remove', 'Remove') }}</span></th>
        </tr></thead>
        <tbody>
          <tr v-for="(item, index) in modelValue" :key="item.field" :data-match-index="index">
            <template v-if="readonly">
              <td>{{ label(item.field) }}</td><td>{{ conditions.find(c => c.value === item.operator)?.label }}</td><td class="match-value">{{ display(item) }}</td>
            </template>
            <template v-else>
              <td><n-select :value="item.field" :options="options(index)" :disabled="disabled" :aria-label="`${t('settings.firewall.matchField', 'Field')} ${index + 1}`" @update:value="setField(index, $event)" /></td>
              <td><n-select :value="item.operator" :options="conditions.map(c => ({ ...c, disabled: item.field === 'protocol' && item.value === 'tcp-udp' && c.value === 'neq' }))" :disabled="disabled" :aria-label="`${t('settings.firewall.matchCondition', 'Condition')} ${index + 1}`" @update:value="update(index, { operator: $event })" /></td>
              <td>
                <n-select v-if="item.field === 'protocol'" :value="item.value" :options="protocols.filter(p => p.value !== 'tcp-udp' || item.operator === 'eq')" :disabled="disabled" :aria-label="`${t('settings.firewall.matchValue', 'Value')} ${index + 1}`" @update:value="update(index, { value: $event })" />
                <n-input v-else :value="item.value" :placeholder="placeholder(item.field)" :disabled="disabled" :aria-label="`${t('settings.firewall.matchValue', 'Value')} ${index + 1}`" @update:value="update(index, { value: $event })" />
              </td>
              <td><n-button quaternary circle :disabled="disabled" :aria-label="`${t('settings.firewall.removeMatch', 'Remove match')} ${index + 1}`" @click="remove(index)"><template #icon><Trash2 :size="15" /></template></n-button></td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.firewall-matches { display: grid; gap: 10px; min-width: 0; }
.match-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.match-heading strong { font-size: 14px; }
.match-hint { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.match-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; }
.match-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.match-table th { padding: 9px 10px; text-align: start; color: var(--muted-foreground); font-size: 12px; font-weight: 500; background: var(--muted); }
.match-table td { padding: 8px; border-top: 1px solid var(--border); font-size: 12px; vertical-align: middle; }
.match-table th:nth-child(1) { width: 29%; }
.match-table th:nth-child(2) { width: 25%; }
.match-table th:last-child:not(:nth-child(3)) { width: 44px; }
.match-value { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.is-readonly .match-table th, .is-readonly .match-table td { padding: 6px 10px; }
.match-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 600px) { .firewall-matches:not(.is-readonly) .match-table { min-width: 560px; } }
</style>
