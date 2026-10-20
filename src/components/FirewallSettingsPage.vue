<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { GripVertical, Plus, Trash2 } from '@/icons'
import { useMessage } from 'naive-ui'

import { api, type ExtensionSummary, type FirewallStatus } from '@/api/client'
import FirewallInstallCard from './FirewallInstallCard.vue'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import {
  applyPayload,
  collapseDraft,
  draftFromStatus,
  draftsEqual,
  enableProtection,
  expandDraft,
  isAnywhere,
  managementServices,
  protocolPort,
  reorderVisible,
  servicePortRules,
  serviceEnabled,
  setService,
  type FirewallDraft,
  type FirewallRuleDraft,
  type ServiceDef,
} from '@/lib/firewall-draft'

const props = defineProps<{ catalog: ExtensionSummary[]; catalogLoading?: boolean }>()
const emit = defineEmits<{ catalog: [value: ExtensionSummary[]]; openPlugins: [] }>()
const message = useMessage()
const overlayTo = useOverlayMount()
const loading = ref(true)
const saving = ref(false)
const confirming = ref(false)
const rollingBack = ref(false)
const error = ref('')
const connectionLost = ref(false)
const status = ref<FirewallStatus | null>(null)
const saved = ref<FirewallDraft | null>(null)
const draft = ref<FirewallDraft | null>(null)
const mode = ref<'simple' | 'advanced'>(localStorage.getItem('onekvm-firewall-mode') === 'advanced' ? 'advanced' : 'simple')
const httpPort = ref(80)
const httpsPort = ref(443)
const expiresAt = ref(0)
const now = ref(Date.now())
const ruleModal = ref(false)
const ruleModalSimple = ref(true)
const sourceModal = ref(false)
const sourceAddress = ref('')
const dragId = ref<number | null>(null)
const overId = ref<number | null>(null)
const ruleAction = ref('allow')
const ruleDirection = ref('in')
const ruleProtocol = ref('tcp')
const rulePort = ref('')
const ruleSourceMode = ref<'any' | 'address'>('any')
const ruleSource = ref('')
const ruleComment = ref('')
let nextId = -1
let pollTimer: number | null = null
let clockTimer: number | null = null

const services = computed(() => managementServices(httpPort.value, httpsPort.value))
const dirty = computed(() => Boolean(saved.value && draft.value && !draftsEqual(saved.value, draft.value)))
const pending = computed(() => Boolean(status.value?.confirmation?.pending))
const seconds = computed(() => pending.value ? Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)) : 0)
const busy = computed(() => saving.value || pending.value)
const servicePortsList = computed(() => draft.value ? servicePortRules(draft.value.rules) : [])
const summary = computed(() => {
  if (!draft.value) return ''
  if (!draft.value.enabled) return t('settings.firewall.openHint', 'The firewall is off, so every incoming connection is accepted. The choices below take effect after you turn it on.')
  if (draft.value.defaultIncoming === 'allow') return t('settings.firewall.allowAllHint', 'The firewall is on, but incoming connections that match no rule are still accepted.')
  return t('settings.firewall.protectedHint', 'Only the services switched on below can connect in. Other incoming connections are blocked.')
})

const actionOptions = computed(() => [
  { value: 'allow', label: t('settings.firewall.allow', 'Allow') },
  { value: 'deny', label: t('settings.firewall.deny', 'Block') },
  { value: 'reject', label: t('settings.firewall.reject', 'Reject') },
  { value: 'limit', label: t('settings.firewall.limit', 'Limit rate') },
])
const directionOptions = computed(() => [
  { value: 'in', label: t('settings.firewall.in', 'incoming') },
  { value: 'out', label: t('settings.firewall.out', 'outgoing') },
])
const protocolOptions = computed(() => [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'any', label: t('settings.firewall.anyProtocol', 'TCP and UDP') },
])

function policyHint(direction: 'incoming' | 'outgoing', policy: string) {
  const key = `${direction}${policy.charAt(0).toUpperCase()}${policy.slice(1)}`
  return t(`settings.firewall.${key}`, policy)
}

function endpoint(rule: Pick<FirewallRuleDraft, 'protocol' | 'port'>) {
  return protocolPort(rule.protocol, rule.port)
}

function sentence(rule: FirewallRuleDraft) {
  return t('settings.firewall.sentence', '{action} {direction} {endpoint} from {source}')
    .replace('{action}', t(`settings.firewall.${rule.action}`, rule.action))
    .replace('{direction}', t(rule.direction === 'out' ? 'settings.firewall.out' : 'settings.firewall.in', rule.direction))
    .replace('{endpoint}', endpoint(rule))
    .replace('{source}', isAnywhere(rule.source) ? t('settings.firewall.anywhere', 'Anywhere') : rule.source)
}

function ruleDetail(rule: FirewallRuleDraft) {
  const parts: string[] = []
  if (!(rule.action === 'allow' && rule.direction === 'in')) parts.push(`${t(`settings.firewall.${rule.action}`, rule.action)}${t(rule.direction === 'out' ? 'settings.firewall.out' : 'settings.firewall.in', rule.direction)}`)
  if (!isAnywhere(rule.source)) parts.push(rule.source)
  if (rule.comment) parts.push(rule.comment)
  return parts.join(' · ')
}

function serviceById(id: ServiceDef['id']) {
  return services.value.find((service) => service.id === id) || services.value[0]
}

function servicePorts(service: ServiceDef) {
  return service.ports.map((port) => protocolPort(service.protocol, String(port))).join('、')
}

function cloneDraft(value: FirewallDraft): FirewallDraft {
  return JSON.parse(JSON.stringify(value)) as FirewallDraft
}

function remember(next: FirewallStatus, replaceDraft: boolean) {
  status.value = next
  const incoming = draftFromStatus(next)
  saved.value = cloneDraft(incoming)
  const shown = mode.value === 'advanced' ? expandDraft(incoming) : incoming
  if (replaceDraft || !draft.value || (!draftsEqual(draft.value, incoming) && !dirty.value)) draft.value = cloneDraft(shown)
  if (next.confirmation?.pending) {
    expiresAt.value = Date.now() + Math.max(0, next.confirmation.seconds_remaining) * 1000
    connectionLost.value = false
  } else {
    expiresAt.value = 0
  }
}

async function load(replaceDraft = true) {
  loading.value = true
  error.value = ''
  try {
    const [firewall, config] = await Promise.all([
      api.getFirewall(),
      api.getConfig().catch(() => null),
    ])
    if (config) {
      httpPort.value = config.network.http_port || 80
      httpsPort.value = config.network.https_port || 443
    }
    remember(firewall, replaceDraft)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

function setMode(value: 'simple' | 'advanced') {
  if (draft.value && value !== mode.value) {
    draft.value = value === 'advanced' ? expandDraft(draft.value) : collapseDraft(draft.value)
  }
  mode.value = value
  localStorage.setItem('onekvm-firewall-mode', value)
}

function updateDraft(recipe: (current: FirewallDraft) => FirewallDraft) {
  if (!draft.value || busy.value) return
  draft.value = recipe(draft.value)
}

function toggleEnabled(enabled: boolean) {
  updateDraft((current) => enabled ? enableProtection(current, services.value) : { ...current, enabled: false })
}

function toggleService(service: ServiceDef, enabled: boolean) {
  updateDraft((current) => ({ ...current, rules: setService(current.rules, service, enabled) }))
}

function validPort(port: string) {
  return /^[0-9]{1,5}(?::[0-9]{1,5})?$/.test(port.trim())
}

function duplicateAllow(port: string, protocol: string, direction: string, source: string) {
  return Boolean(draft.value?.rules.some((rule) => rule.action === 'allow' && rule.direction === direction && rule.port === port && (rule.protocol === protocol || rule.protocol === 'any' || protocol === 'any') && isAnywhere(rule.source) === isAnywhere(source) && (isAnywhere(source) || rule.source === source)))
}

function openRuleModal(simple: boolean) {
  ruleModalSimple.value = simple
  ruleAction.value = 'allow'
  ruleDirection.value = 'in'
  ruleProtocol.value = 'tcp'
  rulePort.value = ''
  ruleSourceMode.value = 'any'
  ruleSource.value = ''
  ruleComment.value = ''
  ruleModal.value = true
}

function addSimplePort() {
  const port = rulePort.value.trim()
  if (!validPort(port)) {
    message.warning(t('settings.firewall.portRequired', 'Enter a port, such as 22, 443, or 8000:8010'))
    return false
  }
  if (duplicateAllow(port, ruleProtocol.value, 'in', '')) {
    message.warning(t('settings.firewall.duplicate', 'That port is already allowed'))
    return false
  }
  updateDraft((current) => ({
    ...current,
    rules: [...current.rules, { id: nextId--, action: 'allow', direction: 'in', protocol: ruleProtocol.value, port, source: '', comment: ruleComment.value.trim() }],
  }))
  return true
}

function addAdvancedRule() {
  const port = rulePort.value.trim()
  const source = ruleSourceMode.value === 'address' ? ruleSource.value.trim() : ''
  if (!validPort(port)) {
    message.warning(t('settings.firewall.portRequired', 'Enter a port, such as 22, 443, or 8000:8010'))
    return false
  }
  if (ruleSourceMode.value === 'address' && !source) {
    message.warning(t('settings.firewall.sourceRequired', 'Enter an address or network'))
    return false
  }
  if (ruleAction.value === 'allow' && duplicateAllow(port, ruleProtocol.value, ruleDirection.value, source)) {
    message.warning(t('settings.firewall.duplicate', 'That port is already allowed'))
    return false
  }
  updateDraft((current) => ({
    ...current,
    rules: [...current.rules, {
      id: nextId--,
      action: ruleAction.value,
      direction: ruleDirection.value,
      protocol: ruleProtocol.value,
      port,
      source,
      comment: ruleComment.value.trim(),
    }],
  }))
  rulePort.value = ''
  ruleSource.value = ''
  ruleComment.value = ''
  return true
}

function submitRule() {
  const added = ruleModalSimple.value ? addSimplePort() : addAdvancedRule()
  if (added) ruleModal.value = false
}

function validAddress(value: string) {
  const address = value.trim()
  if (!address || address.length > 64) return false
  const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/)
  if (ipv4) {
    const prefix = ipv4[5] === undefined ? 32 : Number(ipv4[5])
    return ipv4.slice(1, 5).every((part) => Number(part) <= 255) && prefix <= 32
  }
  if (!address.includes(':') || !/^[0-9a-fA-F:]+(?:\/\d{1,3})?$/.test(address)) return false
  const prefix = address.includes('/') ? Number(address.split('/')[1]) : 128
  return prefix <= 128
}

function openSourceModal() {
  sourceAddress.value = ''
  sourceModal.value = true
}

function addSource() {
  const address = sourceAddress.value.trim()
  if (!validAddress(address)) {
    message.warning(t('settings.firewall.addressInvalid', 'Enter an IP address or network, such as 10.0.0.0/24'))
    return
  }
  if (draft.value?.allowSources.includes(address)) {
    message.warning(t('settings.firewall.addressDuplicate', 'That address is already on the whitelist'))
    return
  }
  updateDraft((current) => ({ ...current, allowSources: [...current.allowSources, address] }))
  sourceModal.value = false
}

function removeSource(address: string) {
  updateDraft((current) => ({ ...current, allowSources: current.allowSources.filter((item) => item !== address) }))
}

function visibleRuleIds() {
  if (!draft.value) return []
  const rows = mode.value === 'simple' ? servicePortRules(draft.value.rules) : draft.value.rules
  return rows.map((rule) => rule.id)
}

function reorder(fromId: number, toId: number) {
  updateDraft((current) => ({ ...current, rules: reorderVisible(current.rules, visibleRuleIds(), fromId, toId) }))
}

function startDrag(event: PointerEvent, id: number) {
  if (busy.value || event.button !== 0) return
  dragId.value = id
  overId.value = id
  const handle = event.currentTarget as HTMLElement | null
  try {
    handle?.setPointerCapture(event.pointerId)
  } catch {
    // The pointer can already be gone. The coordinates on pointerup still finish the move.
  }
}

function ruleIdFromPoint(x: number, y: number) {
  for (const row of document.querySelectorAll<HTMLElement>('[data-rule-id]')) {
    const box = row.getBoundingClientRect()
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue
    const id = Number(row.getAttribute('data-rule-id'))
    if (Number.isFinite(id)) return id
  }
  return null
}

function moveDrag(event: PointerEvent) {
  if (dragId.value == null) return
  const id = ruleIdFromPoint(event.clientX, event.clientY)
  if (id != null) overId.value = id
}

function endDrag(event: PointerEvent) {
  const from = dragId.value
  const to = ruleIdFromPoint(event.clientX, event.clientY) ?? overId.value
  dragId.value = null
  overId.value = null
  if (from != null && to != null && from !== to) reorder(from, to)
}

function removeRule(id: number) {
  updateDraft((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }))
}

function discard() {
  if (!saved.value) return
  draft.value = cloneDraft(mode.value === 'advanced' ? expandDraft(saved.value) : saved.value)
}

async function apply() {
  if (!draft.value) return
  saving.value = true
  try {
    const next = await api.updateFirewall(applyPayload(draft.value))
    remember(next, true)
    if (!next.confirmation?.pending) message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

async function confirmChange() {
  confirming.value = true
  try {
    await api.confirmFirewall()
    message.success(t('settings.firewall.confirmed', 'Firewall change kept'))
    await load(true)
  } catch (reason) {
    message.error(`${t('settings.firewall.confirmError', 'Could not confirm')}: ${reason instanceof Error ? reason.message : String(reason)}`)
  } finally {
    confirming.value = false
  }
}

async function rollbackChange() {
  rollingBack.value = true
  try {
    await api.rollbackFirewall()
    message.warning(t('settings.firewall.rolledBack', 'Previous firewall restored'))
    await load(true)
  } catch (reason) {
    message.error(`${t('settings.firewall.rollbackError', 'Could not restore')}: ${reason instanceof Error ? reason.message : String(reason)}`)
  } finally {
    rollingBack.value = false
  }
}

async function poll() {
  if (!pending.value) return
  try {
    const next = await api.getFirewall()
    const wasPending = pending.value
    remember(next, true)
    connectionLost.value = false
    if (wasPending && !next.confirmation?.pending && !confirming.value && !rollingBack.value) {
      message.warning(t('settings.firewall.autoRollback', 'The firewall was restored because it was not confirmed'))
    }
  } catch {
    connectionLost.value = true
  }
}

const preview = computed(() => {
  const rule = {
    id: 0,
    action: ruleAction.value,
    direction: ruleDirection.value,
    protocol: ruleProtocol.value,
    port: rulePort.value.trim() || '…',
    source: ruleSourceMode.value === 'address' ? ruleSource.value.trim() : '',
    comment: ruleComment.value,
  }
  if (!ruleModalSimple.value) return sentence(rule)
  return t('settings.firewall.portSentence', '{action} {direction} {endpoint}')
    .replace('{action}', t(`settings.firewall.${rule.action}`, rule.action))
    .replace('{direction}', t(rule.direction === 'out' ? 'settings.firewall.out' : 'settings.firewall.in', rule.direction))
    .replace('{endpoint}', endpoint(rule))
})

onMounted(() => {
  void load(true)
  clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  pollTimer = window.setInterval(() => { if (pending.value) void poll() }, 2000)
})

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <section class="firewall-page">
    <n-alert v-if="error" type="error" :title="t('common.error', 'Error')" closable @close="error = ''">{{ error }}</n-alert>
    <FirewallInstallCard v-if="status && !status.available" :catalog="props.catalog" :loading="props.catalogLoading"
      @catalog="emit('catalog', $event)" @installed="load(true)" @open-plugins="emit('openPlugins')" />

    <div v-if="draft && status?.available" class="firewall-toolbar">
      <div>
        <p>{{ mode === 'simple' ? t('settings.firewall.simpleDescription', 'Allow the ports you need, then use the whitelist to choose which addresses may connect.') : t('settings.firewall.advancedDescription', 'Each rule says what to allow or block. Everything else follows the choice below.') }}</p>
      </div>
      <div class="firewall-toolbar-actions">
        <n-tag :type="draft.enabled ? 'success' : 'default'" round>{{ draft.enabled ? t('settings.firewall.active', 'On') : t('settings.firewall.inactive', 'Off') }}</n-tag>
        <n-button-group>
          <n-button :type="mode === 'simple' ? 'primary' : 'default'" @click="setMode('simple')">{{ t('settings.firewall.simple', 'Simple') }}</n-button>
          <n-button :type="mode === 'advanced' ? 'primary' : 'default'" @click="setMode('advanced')">{{ t('settings.firewall.advanced', 'Advanced') }}</n-button>
        </n-button-group>
      </div>
    </div>

    <n-spin :show="loading && !draft">
      <div v-if="draft && status?.available" class="firewall-stack">
        <section class="firewall-card">
          <header>
            <h2>{{ t('settings.firewall.enabled', 'Turn on the firewall') }}</h2>
            <p>{{ t('settings.firewall.enabledHint', 'Only the services below can connect in. Connections started by this device are unchanged. Turning the firewall off does not delete those allows.') }}</p>
          </header>
          <div class="firewall-switch-row">
            <p>{{ summary }}</p>
            <n-switch :value="draft.enabled" :disabled="busy" @update:value="(enabled: boolean) => mode === 'simple' ? toggleEnabled(enabled) : updateDraft((current) => ({ ...current, enabled }))" />
          </div>
        </section>

        <section v-if="mode === 'simple'" class="firewall-card">
          <header>
            <h2>{{ t('settings.firewall.services', 'Who can connect') }}</h2>
            <p>{{ t('settings.firewall.servicesHint', 'These are the usual ways to manage this device.') }}</p>
          </header>
          <ul class="firewall-list">
            <li v-for="service in services" :key="service.id">
              <div>
                <strong>{{ service.id === 'web' ? t('settings.firewall.web', 'Web') : t('settings.firewall.ssh', 'SSH') }}</strong>
                <small>{{ service.id === 'web' ? t('settings.firewall.webHint', 'The page you are using now.') : t('settings.firewall.sshHint', 'Command-line login.') }} {{ servicePorts(service) }}</small>
              </div>
              <n-switch :value="serviceEnabled(draft.rules, service)" :disabled="busy" @update:value="(enabled: boolean) => toggleService(serviceById(service.id), enabled)" />
            </li>
          </ul>
        </section>

        <section v-if="mode === 'simple'" class="firewall-card">
          <header class="firewall-card-heading">
            <div>
              <h2>{{ t('settings.firewall.servicePorts', 'Allowed service ports') }}</h2>
              <p>{{ t('settings.firewall.servicePortsHint', 'These ports may accept connections, such as TCP/22. Ports higher in the list match first. Who may use them is set in the whitelist below.') }}</p>
            </div>
            <n-button class="firewall-add-port" :disabled="busy" @click="openRuleModal(true)">
              <template #icon><Plus :size="15" /></template>
              {{ t('settings.firewall.addPort', 'Add port') }}
            </n-button>
          </header>
          <p v-if="!servicePortsList.length" class="firewall-empty">{{ t('settings.firewall.servicePortsEmpty', 'No ports are allowed yet. Turn on Web or SSH above, or add a port.') }}</p>
          <ul v-else class="firewall-list">
            <li v-for="rule in servicePortsList" :key="rule.id" class="firewall-rule" :class="{ 'is-dragging': dragId === rule.id, 'is-over': overId === rule.id && dragId !== rule.id }" :data-rule-id="rule.id">
              <button type="button" class="firewall-drag" :disabled="busy" :aria-label="t('settings.firewall.drag', 'Drag to reorder')" @pointerdown="startDrag($event, rule.id)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
                <GripVertical :size="16" />
              </button>
              <div class="firewall-rule-main">
                <strong>{{ endpoint(rule) }}</strong>
                <small v-if="ruleDetail(rule)">{{ ruleDetail(rule) }}</small>
              </div>
              <n-button quaternary circle :disabled="busy" :aria-label="t('settings.firewall.remove', 'Remove')" @click="removeRule(rule.id)">
                <template #icon><Trash2 :size="15" /></template>
              </n-button>
            </li>
          </ul>
        </section>

        <section v-if="mode === 'simple'" class="firewall-card">
          <header class="firewall-card-heading">
            <div>
              <h2>{{ t('settings.firewall.whitelist', 'Whitelist') }}</h2>
              <p>{{ t('settings.firewall.whitelistHint', 'Only these addresses can connect to the ports above. Leave this empty to allow any address.') }}</p>
            </div>
            <n-button class="firewall-add-port" :disabled="busy" @click="openSourceModal">
              <template #icon><Plus :size="15" /></template>
              {{ t('settings.firewall.addAddress', 'Add address') }}
            </n-button>
          </header>
          <p v-if="!draft.allowSources.length" class="firewall-empty">{{ t('settings.firewall.whitelistEmpty', 'No addresses yet. An empty list does not restrict the source.') }}</p>
          <ul v-else class="firewall-list">
            <li v-for="address in draft.allowSources" :key="address">
              <div class="firewall-rule-main">
                <strong>{{ address }}</strong>
              </div>
              <n-button quaternary circle :disabled="busy" :aria-label="t('settings.firewall.remove', 'Remove')" @click="removeSource(address)">
                <template #icon><Trash2 :size="15" /></template>
              </n-button>
            </li>
          </ul>
        </section>

        <section v-if="mode === 'advanced'" class="firewall-card">
          <header class="firewall-card-heading">
            <div>
              <h2>{{ t('settings.firewall.rules', 'Rules') }}</h2>
              <p>{{ t('settings.firewall.orderHint', 'Rules higher in the list match first. Drag the handle to change the order. Nothing changes until you apply.') }}</p>
            </div>
            <n-button :disabled="busy" @click="openRuleModal(false)">
              <template #icon><Plus :size="15" /></template>
              {{ t('settings.firewall.addRule', 'Add a rule') }}
            </n-button>
          </header>
          <p v-if="!draft.rules.length" class="firewall-empty">{{ t('settings.firewall.noRules', 'No rules yet.') }}</p>
          <ul v-else class="firewall-list">
            <li v-for="rule in draft.rules" :key="rule.id" class="firewall-rule" :class="{ 'is-dragging': dragId === rule.id, 'is-over': overId === rule.id && dragId !== rule.id }" :data-rule-id="rule.id">
              <button type="button" class="firewall-drag" :disabled="busy" :aria-label="t('settings.firewall.drag', 'Drag to reorder')" @pointerdown="startDrag($event, rule.id)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
                <GripVertical :size="16" />
              </button>
              <div class="firewall-rule-main">
                <strong>{{ endpoint(rule) }}</strong>
                <small v-if="ruleDetail(rule)">{{ ruleDetail(rule) }}</small>
              </div>
              <n-button quaternary circle :disabled="busy" :aria-label="t('settings.firewall.remove', 'Remove')" @click="removeRule(rule.id)">
                <template #icon><Trash2 :size="15" /></template>
              </n-button>
            </li>
          </ul>
        </section>

        <section class="firewall-card">
          <header>
            <h2>{{ t('settings.firewall.defaultsTitle', 'Default rules') }}</h2>
            <p>{{ t('settings.firewall.defaultsHint', 'Connections that match none of the ports above are handled here.') }}</p>
          </header>
          <div class="firewall-defaults">
            <div class="firewall-policy">
              <span>{{ t('settings.firewall.incoming', 'Incoming') }}</span>
              <n-radio-group :value="draft.defaultIncoming" :disabled="busy" @update:value="(value: string) => updateDraft((current) => ({ ...current, defaultIncoming: value }))">
                <n-radio-button value="deny">{{ t('settings.firewall.deny', 'Block') }}</n-radio-button>
                <n-radio-button value="reject">{{ t('settings.firewall.reject', 'Reject') }}</n-radio-button>
                <n-radio-button value="allow">{{ t('settings.firewall.allow', 'Allow') }}</n-radio-button>
              </n-radio-group>
              <p>{{ policyHint('incoming', draft.defaultIncoming) }}</p>
            </div>
            <div class="firewall-policy">
              <span>{{ t('settings.firewall.outgoing', 'Outgoing') }}</span>
              <n-radio-group :value="draft.defaultOutgoing" :disabled="busy" @update:value="(value: string) => updateDraft((current) => ({ ...current, defaultOutgoing: value }))">
                <n-radio-button value="allow">{{ t('settings.firewall.allow', 'Allow') }}</n-radio-button>
                <n-radio-button value="deny">{{ t('settings.firewall.deny', 'Block') }}</n-radio-button>
                <n-radio-button value="reject">{{ t('settings.firewall.reject', 'Reject') }}</n-radio-button>
              </n-radio-group>
              <p>{{ policyHint('outgoing', draft.defaultOutgoing) }}</p>
            </div>
          </div>
        </section>

        <footer class="firewall-actions">
          <n-button :disabled="!dirty || busy" @click="discard">{{ t('settings.firewall.discard', 'Discard changes') }}</n-button>
          <n-button type="primary" :loading="saving" :disabled="!dirty || pending" @click="apply">{{ t('settings.firewall.apply', 'Apply') }}</n-button>
        </footer>
      </div>
    </n-spin>

    <n-modal
      v-model:show="ruleModal"
      preset="card"
      :to="overlayTo"
      :z-index="4600"
      :style="{ width: 'min(480px, calc(100vw - 32px))' }"
      :title="ruleModalSimple ? t('settings.firewall.addPort', 'Add port') : t('settings.firewall.addRule', 'Add a rule')"
      :mask-closable="!busy"
      :closable="!busy"
      :close-on-esc="!busy"
    >
      <form class="firewall-modal" @submit.prevent="submitRule">
        <p>{{ ruleModalSimple ? t('settings.firewall.portOnlyHint', 'Enter a protocol and port, such as TCP/5900. An IP address is not needed.') : t('settings.firewall.addRuleHint', 'It is added to the list first. Nothing changes until you apply.') }}</p>
        <template v-if="!ruleModalSimple">
          <label>{{ t('settings.firewall.action', 'What to do') }}<n-select v-model:value="ruleAction" :options="actionOptions" /></label>
          <label>{{ t('settings.firewall.direction', 'Direction') }}<n-select v-model:value="ruleDirection" :options="directionOptions" /></label>
        </template>
        <label>{{ t('settings.firewall.protocol', 'Protocol') }}<n-select v-model:value="ruleProtocol" :options="protocolOptions" /></label>
        <label>{{ t('settings.firewall.port', 'Port') }}<n-input v-model:value="rulePort" autofocus :placeholder="t('settings.firewall.portPlaceholder', 'For example 5900 or 8000:8010')" /></label>
        <template v-if="!ruleModalSimple">
          <label>{{ t('settings.firewall.source', 'From') }}
            <n-select v-model:value="ruleSourceMode" :options="[{ value: 'any', label: t('settings.firewall.anywhere', 'Anywhere') }, { value: 'address', label: t('settings.firewall.specificSource', 'Only this address') }]" />
          </label>
          <label v-if="ruleSourceMode === 'address'">{{ t('settings.firewall.specificSource', 'Only this address') }}
            <n-input v-model:value="ruleSource" :placeholder="t('settings.firewall.sourcePlaceholder', 'For example 10.0.0.0/24')" />
          </label>
        </template>
        <label>{{ t('settings.firewall.comment', 'Note') }}
          <n-input v-model:value="ruleComment" :placeholder="t('settings.firewall.commentPlaceholder', 'Optional, so you can recognize it later')" />
        </label>
        <p class="firewall-preview"><span>{{ t('settings.firewall.preview', 'This will add') }}</span>{{ preview }}</p>
        <div class="firewall-modal-actions">
          <n-button @click="ruleModal = false">{{ t('auth.cancel', 'Cancel') }}</n-button>
          <n-button attr-type="submit" type="primary">{{ t('settings.firewall.addToList', 'Add to list') }}</n-button>
        </div>
      </form>
    </n-modal>

    <n-modal
      v-model:show="sourceModal"
      preset="card"
      :to="overlayTo"
      :z-index="4600"
      :style="{ width: 'min(480px, calc(100vw - 32px))' }"
      :title="t('settings.firewall.addAddress', 'Add address')"
      :mask-closable="!busy"
      :closable="!busy"
      :close-on-esc="!busy"
    >
      <form class="firewall-modal" @submit.prevent="addSource">
        <p>{{ t('settings.firewall.addressHint', 'Enter an IP address or network, such as 10.0.0.0/24. This chooses who can connect, not which port.') }}</p>
        <label>{{ t('settings.firewall.address', 'Address') }}
          <n-input v-model:value="sourceAddress" autofocus :placeholder="t('settings.firewall.addressPlaceholder', 'For example 10.0.0.0/24 or 203.0.113.10')" />
        </label>
        <div class="firewall-modal-actions">
          <n-button @click="sourceModal = false">{{ t('auth.cancel', 'Cancel') }}</n-button>
          <n-button attr-type="submit" type="primary">{{ t('settings.firewall.addToList', 'Add to list') }}</n-button>
        </div>
      </form>
    </n-modal>

    <Teleport to="body">
      <Transition name="system-action-overlay">
        <div v-if="pending" class="system-action-modal-mask" role="dialog" aria-modal="true">
          <section class="system-action-modal-card network-apply-modal" aria-live="assertive">
            <div class="network-apply-countdown" :class="{ urgent: seconds <= 10 }">
              <span>{{ seconds }}<small>s</small></span>
            </div>
            <h2>{{ t('settings.firewall.confirmTitle', 'Confirm firewall change') }}</h2>
            <p>{{ status?.confirmation?.ready === false ? t('settings.firewall.confirmPreparing', 'Applying the firewall…') : t('settings.firewall.confirmMessage', 'Confirm within {time}.').replace('{time}', `${seconds}s`) }}</p>
            <p>{{ t('settings.firewall.confirmDescription', 'If you do not confirm, the previous firewall is restored.') }}</p>
            <p v-if="connectionLost" class="network-apply-warning">{{ t('settings.firewall.connectionLost', 'The connection dropped. Open this page again and confirm, or the previous firewall will be restored.') }}</p>
            <p v-else-if="seconds <= 10" class="network-apply-warning">{{ t('settings.firewall.urgent', 'Time is almost up. Keep the change, or wait for it to restore itself.') }}</p>
            <div class="system-action-modal-actions">
              <n-button secondary :loading="rollingBack" @click="rollbackChange">{{ t('settings.firewall.rollback', 'Restore previous firewall') }}</n-button>
              <n-button type="primary" :loading="confirming" :disabled="status?.confirmation?.ready === false" @click="confirmChange">{{ t('settings.firewall.confirm', 'Keep this change') }}</n-button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.firewall-page { display: grid; gap: 16px; container-type: inline-size; }
.firewall-toolbar { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.firewall-toolbar p { margin: 0; color: var(--muted-foreground); line-height: 1.5; }
.firewall-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.firewall-stack { display: grid; gap: 16px; }
.firewall-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
.firewall-card header h2, .firewall-policy span, .firewall-modal label { font-size: 14px; font-weight: 600; }
.firewall-card header h2 { margin: 0; }
.firewall-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.firewall-card header p, .firewall-policy p, .firewall-empty, .firewall-preview, .firewall-modal p { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.firewall-switch-row, .firewall-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.firewall-switch-row p, .firewall-switch-row small, .firewall-list small { display: block; margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.45; }
.firewall-list { display: grid; margin: 0; padding: 0; list-style: none; }
.firewall-list li { padding: 8px 0; border-top: 1px solid var(--border); }
.firewall-list li:first-child { border-top: 0; padding-top: 0; }
.firewall-list strong { font-size: 13px; }
.firewall-rule-main { flex: 1; min-width: 0; }
.firewall-rule.is-dragging { opacity: 0.45; }
.firewall-rule.is-over { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.firewall-drag { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted-foreground); cursor: grab; touch-action: none; }
.firewall-drag:active { cursor: grabbing; }
.firewall-drag:disabled { cursor: default; opacity: 0.4; }
.firewall-defaults { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px 24px; }
.firewall-policy { display: grid; gap: 8px; align-content: start; min-width: 0; }
.firewall-policy :deep(.n-radio-group) { display: flex; flex-wrap: wrap; width: 100%; }
.firewall-policy :deep(.n-radio-button) { flex: 1 1 0; justify-content: center; min-width: 4.5rem; }
.firewall-preview span { display: block; margin-bottom: 2px; }
.firewall-modal { display: grid; gap: 12px; }
.firewall-modal label { display: grid; gap: 6px; }
.firewall-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.firewall-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@container (max-width: 640px) {
  .firewall-toolbar, .firewall-switch-row, .firewall-card-heading { align-items: stretch; flex-direction: column; }
  .firewall-defaults { grid-template-columns: 1fr; }
  .firewall-toolbar-actions, .firewall-toolbar-actions :deep(.n-button-group) { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
  .firewall-add-port, .firewall-card-heading :deep(.n-button) { width: 100%; }
  .firewall-drag { width: 44px; height: 44px; }
  .firewall-list li { min-height: 48px; }
  .firewall-actions { position: sticky; bottom: 0; padding-top: 8px; background: var(--background); }
}
@media (max-width: 760px) {
  .firewall-toolbar, .firewall-switch-row, .firewall-card-heading { align-items: stretch; flex-direction: column; }
  .firewall-defaults { grid-template-columns: 1fr; }
  .firewall-toolbar-actions, .firewall-toolbar-actions :deep(.n-button-group) { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
  .firewall-add-port, .firewall-card-heading :deep(.n-button) { width: 100%; }
  .firewall-drag { width: 44px; height: 44px; }
  .firewall-list li { min-height: 48px; }
}
</style>
