<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { GripVertical, Pencil, Plus, Trash2 } from '@/icons'
import { t } from '@/i18n/runtime'
import { type FirewallDirection, type FirewallRuleDraft } from '@/lib/firewall-draft'
import { ruleMatches } from '@/lib/firewall-matches'
import FirewallMatchTable from './FirewallMatchTable.vue'

const props = defineProps<{
  direction: FirewallDirection
  rules: FirewallRuleDraft[]
  policy: string
  busy: boolean
}>()
const emit = defineEmits<{
  add: []
  edit: [rule: FirewallRuleDraft]
  remove: [id: number]
  reorder: [fromId: number, toId: number]
  'update:policy': [policy: string]
}>()
const section = useTemplateRef<HTMLElement>('section')
const dragId = shallowRef<number | null>(null)
const overId = shallowRef<number | null>(null)
const incoming = computed(() => props.direction === 'in')
const title = computed(() => incoming.value ? t('settings.firewall.incomingRules', 'Incoming rules') : t('settings.firewall.outgoingRules', 'Outgoing rules'))
const addLabel = computed(() => incoming.value ? t('settings.firewall.addIncomingRule', 'Add incoming rule') : t('settings.firewall.addOutgoingRule', 'Add outgoing rule'))
const policyHint = computed(() => {
  const direction = incoming.value ? 'incoming' : 'outgoing'
  const policy = props.policy
  return t(`settings.firewall.${direction}${policy.charAt(0).toUpperCase()}${policy.slice(1)}`, policy)
})
const policies = computed(() => incoming.value ? ['deny', 'reject', 'allow'] : ['allow', 'deny', 'reject'])

function actionType(action: string) {
  return ({ allow: 'success', deny: 'error', reject: 'warning' } as const)[action as 'allow' | 'deny' | 'reject'] ?? 'default'
}

const ruleName = (rule: FirewallRuleDraft, index: number) => rule.comment || t('settings.firewall.ruleNumber', 'Rule {number}').replace('{number}', String(index + 1))

function ruleAtPoint(x: number, y: number) {
  for (const row of section.value?.querySelectorAll<HTMLElement>('[data-rule-id]') ?? []) {
    const box = row.getBoundingClientRect()
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return Number(row.dataset.ruleId)
  }
  return null
}

function startDrag(event: PointerEvent, id: number) {
  if (props.busy || event.button !== 0) return
  dragId.value = id
  overId.value = id
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (dragId.value !== null) overId.value = ruleAtPoint(event.clientX, event.clientY)
}

function endDrag(event: PointerEvent) {
  const from = dragId.value
  const to = event.type === 'pointercancel' ? null : ruleAtPoint(event.clientX, event.clientY)
  dragId.value = null
  overId.value = null
  if (!props.busy && from !== null && to !== null && from !== to) emit('reorder', from, to)
}
</script>

<template>
  <section ref="section" class="firewall-direction" :data-direction="direction" :aria-label="title">
    <header>
      <h2>{{ title }}</h2>
      <n-button :disabled="busy" :aria-label="addLabel" @click="emit('add')">
        <template #icon><Plus :size="15" /></template>
        {{ t('settings.firewall.addRule', 'Add a rule') }}
      </n-button>
    </header>
    <p v-if="!rules.length" class="firewall-empty">{{ t('settings.firewall.noRules', 'No rules yet.') }}</p>
    <TransitionGroup v-else tag="ul" name="firewall-rule" class="firewall-list">
      <li v-for="(rule, index) in rules" :key="rule.id" class="firewall-rule" :class="{ 'is-dragging': dragId === rule.id, 'is-over': overId === rule.id && dragId !== rule.id }" :data-rule-id="rule.id">
        <button type="button" class="firewall-drag" :disabled="busy" :aria-label="t('settings.firewall.drag', 'Drag to reorder')" @pointerdown="startDrag($event, rule.id)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="dragId = null; overId = null">
          <GripVertical :size="16" />
        </button>
        <div class="firewall-rule-main">
          <div class="firewall-rule-title">
            <n-tag size="small" :type="actionType(rule.action)" :bordered="false">{{ t(`settings.firewall.${rule.action}`, rule.action) }}</n-tag>
            <strong>{{ ruleName(rule, index) }}</strong>
          </div>
        </div>
        <n-button quaternary circle :disabled="busy" :aria-label="`${t('settings.firewall.editRule', 'Edit rule')}: ${ruleName(rule, index)}`" @click="emit('edit', rule)">
          <template #icon><Pencil :size="15" /></template>
        </n-button>
        <n-button quaternary circle :disabled="busy" :aria-label="t('settings.firewall.remove', 'Remove')" @click="emit('remove', rule.id)">
          <template #icon><Trash2 :size="15" /></template>
        </n-button>
        <FirewallMatchTable class="rule-match-table" :model-value="ruleMatches(rule)" :direction="rule.direction" readonly />
      </li>
    </TransitionGroup>
    <div class="firewall-policy">
      <span>{{ t('settings.firewall.defaultAction', 'Default action') }}</span>
      <n-radio-group :value="policy" :disabled="busy" :aria-label="`${title}: ${t('settings.firewall.defaultAction', 'Default action')}`" @update:value="(value: string) => emit('update:policy', value)">
        <n-radio-button v-for="value in policies" :key="value" :value="value">{{ t(`settings.firewall.${value}`, value) }}</n-radio-button>
      </n-radio-group>
      <p>{{ policyHint }}</p>
    </div>
  </section>
</template>

<style scoped>
.firewall-direction { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { margin: 0; font-size: 14px; font-weight: 600; }
.firewall-empty, .firewall-policy p { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.firewall-list { display: grid; margin: 0; padding: 0; list-style: none; }
.firewall-rule { display: grid; grid-template-columns: 32px minmax(0, 1fr) 34px 34px; align-items: flex-start; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); transition: opacity 160ms ease, background-color 160ms ease; }
.firewall-rule:first-child { border-top: 0; padding-top: 0; }
.rule-match-table { grid-column: 2 / -1; }
.firewall-rule-main { display: grid; gap: 10px; flex: 1; min-width: 0; }
.firewall-rule-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
.firewall-rule-title strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.firewall-rule-main small { display: block; margin-top: 4px; color: var(--muted-foreground); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.firewall-rule-move { transition: transform 200ms ease; }
.firewall-rule.is-dragging { opacity: 0.45; }
.firewall-rule.is-over { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.firewall-drag { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted-foreground); cursor: grab; touch-action: none; }
.firewall-drag:active { cursor: grabbing; }
.firewall-drag:disabled { cursor: default; opacity: 0.4; }
.firewall-policy { display: grid; gap: 8px; padding-top: 14px; border-top: 1px solid var(--border); }
.firewall-policy span { font-size: 13px; font-weight: 600; }
.firewall-policy :deep(.n-radio-group) { display: flex; flex-wrap: wrap; width: fit-content; max-width: 100%; }
.firewall-policy :deep(.n-radio-group .n-radio-button) { display: flex; flex: 1 1 0; align-items: center; justify-content: center; min-width: 4.5rem; }
.firewall-policy :deep(.n-radio-button .n-radio__label) { width: 100%; text-align: center; }
@container (max-width: 640px) {
  header { align-items: stretch; flex-direction: column; }
  .firewall-drag { width: 44px; height: 44px; }
  .firewall-rule { min-height: 48px; grid-template-columns: 44px minmax(0, 1fr) 34px 34px; }
  .rule-match-table { grid-column: 1 / -1; }
  .firewall-policy :deep(.n-radio-group) { width: 100%; }
}
@media (max-width: 760px) {
  header { align-items: stretch; flex-direction: column; }
  .firewall-drag { width: 44px; height: 44px; }
  .firewall-rule { min-height: 48px; grid-template-columns: 44px minmax(0, 1fr) 34px 34px; }
  .rule-match-table { grid-column: 1 / -1; }
  .firewall-policy :deep(.n-radio-group) { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .firewall-rule, .firewall-rule-move { transition: none; }
}
</style>
