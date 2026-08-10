<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronRight, Layers3, Plus, RefreshCw, Shield } from '@lucide/vue'

import {
  api,
  type ManagedNetworkInterface,
  type NetworkConfig,
  type NetworkInterfaceStatus,
  type WireGuardConfig,
} from '@/api/client'
import { t } from '@/i18n/runtime'

import NetworkSettingsForm from './NetworkSettingsForm.vue'
import VLANSettingsForm from './VLANSettingsForm.vue'
import WireGuardSettingsForm from './WireGuardSettingsForm.vue'

const props = defineProps<{ modelValue: NetworkConfig; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: NetworkConfig]
  validity: [valid: boolean]
}>()

const interfaces = ref<NetworkInterfaceStatus[]>([])
const expanded = ref('')
const loading = ref(false)
const loadError = ref('')
const wireGuardValidity = ref<Record<string, boolean>>({})
const addOptions = computed(() => [
  { label: 'WireGuard', key: 'wireguard' },
  { label: 'VLAN', key: 'vlan' },
])

const visibleInterfaces = computed(() => {
  const wireGuardNames = new Set((props.modelValue.wireguard || []).map(({ name }) => name))
  const managedNames = new Set((props.modelValue.interfaces || []).map(({ name }) => name))
  const available = interfaces.value.filter(({ name }) => !wireGuardNames.has(name) && !managedNames.has(name)).map((networkInterface) => ({
    ...networkInterface,
    kind: 'physical' as const,
    configured: networkInterface.name === props.modelValue.device,
  }))
  if (props.modelValue.device && !available.some(({ name }) => name === props.modelValue.device)) {
    available.unshift({
      name: props.modelValue.device,
      up: false,
      configured: true,
      mac: '',
      addresses: [],
      kind: 'physical' as const,
      port_type: 'physical' as const,
      link_speed_mbps: 0,
    })
  }
  const wireGuard = (props.modelValue.wireguard || []).map((configuration, wireGuardIndex) => {
    const status = interfaces.value.find(({ name }) => name === configuration.name)
    return {
      name: configuration.name,
      up: status?.up || false,
      configured: Boolean(status),
      mac: '',
      addresses: status?.addresses.length ? status.addresses : configuration.addresses,
      kind: 'wireguard' as const,
      port_type: 'virtual' as const,
      link_speed_mbps: 0,
      configuration,
      wireGuardIndex,
    }
  })
  const managed = (props.modelValue.interfaces || []).map((configuration, managedIndex) => {
    const status = interfaces.value.find(({ name }) => name === configuration.name)
    const addresses = [configuration.ipv4_address, configuration.ipv6_address].filter(Boolean)
    return {
      name: configuration.name,
      up: status?.up || false,
      configured: Boolean(status),
      mac: '',
      addresses: status?.addresses.length ? status.addresses : addresses,
      kind: configuration.kind,
      port_type: 'virtual' as const,
      link_speed_mbps: 0,
      configuration,
      managedIndex,
    }
  })
  return [...available, ...wireGuard, ...managed]
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    interfaces.value = await api.getNetworkInterfaces()
    if (!expanded.value) {
      expanded.value = props.modelValue.device || interfaces.value[0]?.name || ''
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function toggle(name: string) {
  expanded.value = expanded.value === name ? '' : name
}

function selectInterface(name: string) {
  emit('update:modelValue', { ...props.modelValue, device: name })
  expanded.value = name
}

function updateConfig(value: NetworkConfig) {
  emit('update:modelValue', value)
}

function addWireGuard() {
  const names = new Set((props.modelValue.wireguard || []).map(({ name }) => name))
  let index = 0
  while (names.has(`wg${index}`)) index++
  const wireGuard: WireGuardConfig = {
    name: `wg${index}`,
    private_key: '',
    public_key: '',
    addresses: [],
    listen_port: 51820,
    peers: [],
  }
  emit('update:modelValue', { ...props.modelValue, wireguard: [...(props.modelValue.wireguard || []), wireGuard] })
  expanded.value = wireGuard.name
}

function addVLAN() {
  const names = new Set([
    ...(props.modelValue.wireguard || []).map(({ name }) => name),
    ...(props.modelValue.interfaces || []).map(({ name }) => name),
  ])
  let vlanID = 2
  while (names.has(`vlan${vlanID}`)) vlanID++
  const networkInterface: ManagedNetworkInterface = {
    kind: 'vlan',
    name: `vlan${vlanID}`,
    parent: props.modelValue.device,
    vlan_id: vlanID,
    ipv4_mode: 'dhcp',
    ipv4_address: '',
    ipv4_gateway: '',
    ipv6_mode: 'disabled',
    ipv6_address: '',
    ipv6_gateway: '',
    route_metric: 100,
  }
  emit('update:modelValue', { ...props.modelValue, interfaces: [...(props.modelValue.interfaces || []), networkInterface] })
  expanded.value = networkInterface.name
}

function addInterface(kind: string) {
  if (kind === 'wireguard') addWireGuard()
  if (kind === 'vlan') addVLAN()
}

function updateWireGuard(index: number, value: WireGuardConfig) {
  const wireguard = [...(props.modelValue.wireguard || [])]
  const oldName = wireguard[index]?.name
  wireguard[index] = value
  if (oldName && oldName !== value.name && oldName in wireGuardValidity.value) {
    wireGuardValidity.value = { ...wireGuardValidity.value, [value.name]: wireGuardValidity.value[oldName] }
    delete wireGuardValidity.value[oldName]
  }
  emit('update:modelValue', { ...props.modelValue, wireguard })
  if (expanded.value === oldName) expanded.value = value.name
}

function removeWireGuard(index: number) {
  const removed = props.modelValue.wireguard[index]
  emit('update:modelValue', {
    ...props.modelValue,
    wireguard: props.modelValue.wireguard.filter((_, wireGuardIndex) => wireGuardIndex !== index),
  })
  if (expanded.value === removed?.name) expanded.value = ''
  if (removed?.name) setWireGuardValidity(removed.name, true, true)
}

function setWireGuardValidity(name: string, valid: boolean, remove = false) {
  const next = { ...wireGuardValidity.value }
  if (remove) delete next[name]
  else next[name] = valid
  wireGuardValidity.value = next
  emit('validity', Object.values(next).every((value) => value))
}

function updateManagedInterface(index: number, value: ManagedNetworkInterface) {
  const networkInterfaces = [...(props.modelValue.interfaces || [])]
  const oldName = networkInterfaces[index]?.name
  networkInterfaces[index] = value
  emit('update:modelValue', { ...props.modelValue, interfaces: networkInterfaces })
  if (expanded.value === oldName) expanded.value = value.name
}

function removeManagedInterface(index: number) {
  const removed = props.modelValue.interfaces[index]
  emit('update:modelValue', {
    ...props.modelValue,
    interfaces: props.modelValue.interfaces.filter((_, interfaceIndex) => interfaceIndex !== index),
  })
  if (expanded.value === removed?.name) expanded.value = ''
}

onMounted(load)
watch(() => props.disabled, (disabled, previous) => {
  if (previous && !disabled) void load()
})
</script>

<template>
  <section class="network-interface-manager">
    <header class="list-toolbar">
      <span>{{ visibleInterfaces.length }} {{ t('network.interfaces.title', 'Interfaces') }}</span>
      <div>
        <n-dropdown trigger="click" :options="addOptions" :disabled="disabled" @select="addInterface">
          <n-button size="small" quaternary :disabled="disabled">
            <template #icon><Plus /></template>
			{{ t('network.interfaces.addInterface', 'Add interface') }}
          </n-button>
        </n-dropdown>
        <n-tooltip>
          <template #trigger>
			<n-button quaternary circle size="small" :loading="loading" :aria-label="t('network.interfaces.refresh', 'Refresh interfaces')" @click="load">
              <template #icon><RefreshCw /></template>
            </n-button>
          </template>
          {{ t('common.refresh', 'Refresh') }}
        </n-tooltip>
      </div>
    </header>

    <n-alert v-if="loadError" type="error" :show-icon="false">{{ loadError }}</n-alert>
    <n-spin :show="loading">
	  <n-empty v-if="!loading && visibleInterfaces.length === 0" :description="t('network.interfaces.empty', 'No network interfaces')" />
      <ul v-else class="settings-list">
        <li v-for="networkInterface in visibleInterfaces" :key="networkInterface.name" class="settings-list-item">
          <div
            class="settings-list-row"
            role="button"
            tabindex="0"
            :aria-expanded="expanded === networkInterface.name"
            @click="toggle(networkInterface.name)"
            @keydown.enter="toggle(networkInterface.name)"
            @keydown.space.prevent="toggle(networkInterface.name)"
          >
            <ChevronRight
              :size="16"
              class="settings-list-chevron"
              :class="{ expanded: expanded === networkInterface.name }"
            />
            <Shield v-if="networkInterface.kind === 'wireguard'" :size="16" class="interface-kind-icon" />
            <Layers3 v-else-if="networkInterface.kind === 'vlan'" :size="16" class="interface-kind-icon" />
            <div class="settings-list-identity">
              <strong>{{ networkInterface.name }}</strong>
              <span>{{ networkInterface.addresses[0] || t('network.interfaces.noAddress', 'No address') }}</span>
            </div>
            <n-tag v-if="networkInterface.configured" size="small" type="info" :bordered="false">
              {{ t('network.interfaces.configured', 'Configured') }}
            </n-tag>
			<n-tag size="small" :bordered="false">
			  {{ networkInterface.port_type === 'physical'
				? t('network.interfaces.physicalPort', 'Physical')
				: t('network.interfaces.virtualPort', 'Virtual') }}
			</n-tag>
            <n-tag size="small" :type="networkInterface.up ? 'success' : 'default'" :bordered="false">
			  {{ networkInterface.up ? t('network.interfaces.up', 'Up') : t('network.interfaces.down', 'Down') }}
            </n-tag>
          </div>

          <n-collapse-transition :show="expanded === networkInterface.name">
            <div class="settings-list-detail">
              <dl v-if="networkInterface.kind === 'physical'" class="interface-facts">
                <div>
                  <dt>{{ t('network.interfaces.currentMAC', 'Current MAC address') }}</dt>
                  <dd>{{ networkInterface.mac || '-' }}</dd>
                </div>
				<div v-if="networkInterface.port_type === 'physical'">
				  <dt>{{ t('network.interfaces.linkSpeed', 'Link speed') }}</dt>
				  <dd>{{ networkInterface.link_speed_mbps > 0
					? `${networkInterface.link_speed_mbps} Mbps`
					: t('network.interfaces.speedUnavailable', 'Unavailable') }}</dd>
				</div>
                <div>
                  <dt>{{ t('network.interfaces.addresses', 'Addresses') }}</dt>
                  <dd>
                    <span v-for="address in networkInterface.addresses" :key="address">{{ address }}</span>
                    <span v-if="networkInterface.addresses.length === 0">-</span>
                  </dd>
                </div>
              </dl>

              <n-form v-if="networkInterface.kind === 'wireguard'" label-placement="top" :show-feedback="false">
                <WireGuardSettingsForm
                  :model-value="networkInterface.configuration"
                  :disabled="disabled"
                  @update:model-value="updateWireGuard(networkInterface.wireGuardIndex, $event)"
                  @validity="setWireGuardValidity(networkInterface.configuration.name, $event)"
                  @remove="removeWireGuard(networkInterface.wireGuardIndex)"
                />
              </n-form>
              <n-form v-else-if="networkInterface.kind === 'vlan'" label-placement="top" :show-feedback="false">
                <VLANSettingsForm
                  :model-value="networkInterface.configuration"
                  :disabled="disabled"
                  @update:model-value="updateManagedInterface(networkInterface.managedIndex, $event)"
                  @remove="removeManagedInterface(networkInterface.managedIndex)"
                />
              </n-form>
              <n-form v-else-if="networkInterface.configured" label-placement="top" :show-feedback="false">
                <NetworkSettingsForm
                  :model-value="modelValue"
                  :disabled="disabled"
                  :show-device="false"
                  @update:model-value="updateConfig"
                />
              </n-form>
              <div v-else class="interface-select-action">
                <n-button type="primary" secondary :disabled="disabled" @click.stop="selectInterface(networkInterface.name)">
                  {{ t('network.interfaces.configure', 'Configure this interface') }}
                </n-button>
              </div>
            </div>
          </n-collapse-transition>
        </li>
      </ul>
    </n-spin>
  </section>
</template>

<style scoped>
.network-interface-manager { display: grid; gap: 10px; }
.list-toolbar {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  color: #929ca5;
  font-size: 12px;
}
.list-toolbar > div { display: flex; gap: 2px; }
.interface-kind-icon { flex: 0 0 auto; color: #58a6ff; }
.settings-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid #30363d;
  border-radius: 6px;
  list-style: none;
}
.settings-list-item + .settings-list-item { border-top: 1px solid #30363d; }
.settings-list-row {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  background: #15191e;
  cursor: pointer;
}
.settings-list-row:hover,
.settings-list-row:focus-visible { background: #1b2026; outline: none; }
.settings-list-chevron { flex: 0 0 auto; color: #818b95; transition: transform 160ms ease; }
.settings-list-chevron.expanded { transform: rotate(90deg); }
.settings-list-identity {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.settings-list-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; }
.settings-list-identity span { overflow: hidden; color: #8f99a3; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.settings-list-detail { display: grid; gap: 18px; padding: 14px 16px 18px 37px; background: #11151a; }
.interface-facts { display: grid; margin: 0; gap: 7px; }
.interface-facts > div { display: grid; grid-template-columns: minmax(80px, .3fr) minmax(0, 1fr); gap: 14px; }
.interface-facts dt { color: #8f99a3; font-size: 11px; }
.interface-facts dd { display: grid; min-width: 0; margin: 0; font-size: 12px; }
.interface-facts dd span { overflow-wrap: anywhere; }
.interface-select-action { display: flex; justify-content: flex-end; }
@media (max-width: 520px) {
  .settings-list-row { padding-inline: 9px; }
  .settings-list-detail { padding: 14px 10px 16px 34px; }
  .settings-list-row :deep(.n-tag):first-of-type { display: none; }
}
</style>
