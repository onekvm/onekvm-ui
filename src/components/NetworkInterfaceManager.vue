<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronRight, Layers3, Network, Plus, RefreshCw, Shield, Wifi } from '@lucide/vue'

import {
  api,
  type ManagedNetworkInterface,
  type NetworkConfig,
  type NetworkInterfaceStatus,
  type VpnClientConfig,
  type WireGuardConfig,
} from '@/api/client'
import { t } from '@/i18n/runtime'
import { defaultManagedTunnel, networkKindLabel } from '@/lib/network'

import NetworkSettingsForm from './NetworkSettingsForm.vue'
import TunnelSettingsForm from './TunnelSettingsForm.vue'
import VLANSettingsForm from './VLANSettingsForm.vue'
import VpnSettingsForm from './VpnSettingsForm.vue'
import WifiOnboarding from './WifiOnboarding.vue'
import WireGuardSettingsForm from './WireGuardSettingsForm.vue'

const TUNNEL_KINDS = ['gre', 'ipip', 'sit', 'vxlan', 'geneve', 'fou', 'bareudp', 'gretap'] as const
type TunnelKind = (typeof TUNNEL_KINDS)[number]
const OVERLAY_KINDS = ['vxlan', 'geneve'] as const
const POINT_TUNNEL_KINDS = ['gre', 'ipip', 'sit', 'fou', 'bareudp', 'gretap'] as const
const VPN_KINDS = ['openvpn', 'pppoe', 'pptp', 'l2tp'] as const
type VpnKind = (typeof VPN_KINDS)[number]

const props = defineProps<{
  modelValue: NetworkConfig
  disabled?: boolean
  wireguardAvailable?: boolean
  ipTunnelsAvailable?: boolean
  openvpnAvailable?: boolean
  pppoeAvailable?: boolean
  pptpAvailable?: boolean
  l2tpAvailable?: boolean
  wifiAvailable?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: NetworkConfig]
  validity: [valid: boolean]
}>()

const interfaces = ref<NetworkInterfaceStatus[]>([])
const expanded = ref('')
const loading = ref(false)
const loadError = ref('')
const wireGuardValidity = ref<Record<string, boolean>>({})
const wireguardSupported = computed(() => props.wireguardAvailable !== false)
const tunnelsSupported = computed(() => props.ipTunnelsAvailable !== false)
const vpnAvailability = computed(() => ({
  openvpn: props.openvpnAvailable !== false,
  pppoe: props.pppoeAvailable !== false,
  pptp: props.pptpAvailable !== false,
  l2tp: props.l2tpAvailable !== false,
}))
const addOptions = computed(() => [
  {
    type: 'group',
    key: 'group-virtual',
    label: t('network.interfaces.addGroupVirtual', 'Virtual'),
    children: [{ label: networkKindLabel('vlan'), key: 'vlan' }],
  },
  {
    type: 'group',
    key: 'group-overlay',
    label: t('network.interfaces.addGroupOverlay', 'Overlay'),
    children: OVERLAY_KINDS.map((kind) => ({
      label: networkKindLabel(kind),
      key: kind,
      disabled: !tunnelsSupported.value,
    })),
  },
  {
    type: 'group',
    key: 'group-tunnels',
    label: t('network.interfaces.addGroupTunnels', 'Tunnels'),
    children: POINT_TUNNEL_KINDS.map((kind) => ({
      label: networkKindLabel(kind),
      key: kind,
      disabled: !tunnelsSupported.value,
    })),
  },
  {
    type: 'group',
    key: 'group-vpn',
    label: t('network.interfaces.addGroupVpn', 'VPN'),
    children: [
      {
        label: networkKindLabel('wireguard'),
        key: 'wireguard',
        disabled: !wireguardSupported.value,
      },
      ...VPN_KINDS.map((kind) => ({
        label: networkKindLabel(kind),
        key: kind,
        disabled: !vpnAvailability.value[kind],
      })),
    ],
  },
])

const visibleInterfaces = computed(() => {
  const wireGuardNames = new Set((props.modelValue.wireguard || []).map(({ name }) => name))
  const managedNames = new Set((props.modelValue.interfaces || []).map(({ name }) => name))
  const vpnNames = new Set((props.modelValue.vpn || []).map(({ name }) => name))
  const available = interfaces.value
    .filter(({ name }) => !wireGuardNames.has(name) && !managedNames.has(name) && !vpnNames.has(name))
    .map((networkInterface) => ({
      ...networkInterface,
      kind: props.wifiAvailable && networkInterface.name === 'ap0' ? 'wifi_ap' as const
        : props.wifiAvailable && networkInterface.name === 'wlan0' ? 'wifi_station' as const : 'physical' as const,
      configured: networkInterface.name === props.modelValue.device,
    }))
  if (props.wifiAvailable) {
    if (!available.some(({ name }) => name === 'ap0')) {
      available.push({ name: 'ap0', up: false, configured: false, mac: '', addresses: [],
        kind: 'wifi_ap', port_type: 'virtual', link_speed_mbps: 0 })
    }
    if (!available.some(({ name }) => name === 'wlan0')) {
      available.push({ name: 'wlan0', up: false, configured: false, mac: '', addresses: [],
        kind: 'wifi_station', port_type: 'physical', link_speed_mbps: 0 })
    }
  }
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
      // Present in OneKVM config — not gated on kernel iface existing yet.
      configured: true,
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
      configured: true,
      mac: '',
      addresses: status?.addresses.length ? status.addresses : addresses,
      kind: configuration.kind,
      port_type: 'virtual' as const,
      link_speed_mbps: 0,
      configuration,
      managedIndex,
    }
  })
  const vpn = (props.modelValue.vpn || []).map((configuration, vpnIndex) => {
    const status = interfaces.value.find(({ name }) => name === configuration.name)
    return {
      name: configuration.name,
      up: status?.up || false,
      configured: true,
      mac: '',
      addresses: status?.addresses || [],
      kind: configuration.kind,
      port_type: 'virtual' as const,
      link_speed_mbps: 0,
      configuration,
      vpnIndex,
    }
  })
  return [...available, ...wireGuard, ...managed, ...vpn]
})

function isTunnelKind(kind: string): kind is TunnelKind {
  return (TUNNEL_KINDS as readonly string[]).includes(kind)
}

function isVpnKind(kind: string): kind is VpnKind {
  return (VPN_KINDS as readonly string[]).includes(kind)
}

type VisibleInterface = (typeof visibleInterfaces.value)[number]
type ManagedVisibleInterface = Extract<VisibleInterface, { managedIndex: number }>
type VpnVisibleInterface = Extract<VisibleInterface, { vpnIndex: number }>

function isManagedTunnel(iface: VisibleInterface): iface is ManagedVisibleInterface & { kind: TunnelKind } {
  return 'managedIndex' in iface && isTunnelKind(iface.kind)
}

function isVpnInterface(iface: VisibleInterface): iface is VpnVisibleInterface & { kind: VpnKind } {
  return 'vpnIndex' in iface && isVpnKind(iface.kind)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    interfaces.value = await api.getNetworkInterfaces()
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
  const names = usedNames()
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
  const names = usedNames()
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

function usedNames() {
  return new Set([
    ...(props.modelValue.wireguard || []).map(({ name }) => name),
    ...(props.modelValue.interfaces || []).map(({ name }) => name),
    ...(props.modelValue.vpn || []).map(({ name }) => name),
  ])
}

function addTunnel(kind: TunnelKind) {
  const names = usedNames()
  let index = 0
  while (names.has(`${kind}${index}`)) index++
  const networkInterface = defaultManagedTunnel(kind, `${kind}${index}`)
  emit('update:modelValue', { ...props.modelValue, interfaces: [...(props.modelValue.interfaces || []), networkInterface] })
  expanded.value = networkInterface.name
}

function addVpn(kind: VpnKind) {
  const names = usedNames()
  let index = 0
  while (names.has(`${kind}${index}`)) index++
  const client: VpnClientConfig = {
    kind,
    name: `${kind}${index}`,
    enabled: true,
    remote: '',
    port: kind === 'openvpn' ? 1194 : 0,
    protocol: kind === 'openvpn' ? 'udp' : '',
    parent: kind === 'pppoe' ? props.modelValue.device : '',
    username: '',
    password: '',
    service: '',
    config: '',
    default_route: kind === 'pppoe',
  }
  emit('update:modelValue', { ...props.modelValue, vpn: [...(props.modelValue.vpn || []), client] })
  expanded.value = client.name
}

function addMenuProps() {
  return {
    class: 'network-add-interface-menu',
    style: 'max-height: min(24rem, calc(100vh - 12rem))',
  }
}

function addInterface(kind: string) {
  if (kind === 'wireguard') {
    if (!wireguardSupported.value) return
    addWireGuard()
    return
  }
  if (kind === 'vlan') {
    addVLAN()
    return
  }
  if (isTunnelKind(kind)) {
    if (!tunnelsSupported.value) return
    addTunnel(kind)
    return
  }
  if (isVpnKind(kind)) {
    if (!vpnAvailability.value[kind]) return
    addVpn(kind)
  }
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

function updateVpn(index: number, value: VpnClientConfig) {
  const vpn = [...(props.modelValue.vpn || [])]
  const oldName = vpn[index]?.name
  vpn[index] = value
  emit('update:modelValue', { ...props.modelValue, vpn })
  if (expanded.value === oldName) expanded.value = value.name
}

function removeVpn(index: number) {
  const removed = props.modelValue.vpn?.[index]
  emit('update:modelValue', {
    ...props.modelValue,
    vpn: (props.modelValue.vpn || []).filter((_, vpnIndex) => vpnIndex !== index),
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
        <n-dropdown
          trigger="click"
          scrollable
          :menu-props="addMenuProps"
          :options="addOptions"
          :disabled="disabled"
          @select="addInterface"
        >
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
    <n-alert
      v-else-if="!wireguardSupported || !tunnelsSupported"
      type="warning"
      :show-icon="false"
      class="modules-unavailable"
    >
      <template v-if="!wireguardSupported && !tunnelsSupported">
        {{ t(
          'network.modules.unavailableBoth',
          'WireGuard and IP tunnel kernel modules are not installed. Install onekvm-kernel-module-wireguard (depends on onekvm-kernel-module-ip-tunnels).',
        ) }}
      </template>
      <template v-else-if="!wireguardSupported">
        {{ t(
          'network.wireguard.modulesUnavailable',
          'WireGuard kernel modules are not installed. Install onekvm-kernel-module-wireguard (it depends on onekvm-kernel-module-ip-tunnels).',
        ) }}
      </template>
      <template v-else>
        {{ t(
          'network.tunnels.modulesUnavailable',
          'IP tunnel kernel modules are not installed. Install onekvm-kernel-module-ip-tunnels.',
        ) }}
      </template>
    </n-alert>
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
            <Shield v-if="networkInterface.kind === 'wireguard' || isVpnKind(networkInterface.kind)" :size="16" class="interface-kind-icon" />
            <Layers3 v-else-if="networkInterface.kind === 'vlan'" :size="16" class="interface-kind-icon" />
            <Wifi v-else-if="networkInterface.kind === 'wifi_ap' || networkInterface.kind === 'wifi_station'" :size="16" class="interface-kind-icon" />
            <Network v-else :size="16" class="interface-kind-icon" />
            <div class="settings-list-identity">
              <strong>{{ networkInterface.name }}</strong>
              <span>{{ networkInterface.addresses[0] || t('network.interfaces.noAddress', 'No address') }}</span>
            </div>
            <div class="settings-list-tags">
              <n-tag
                v-if="networkInterface.configured"
                class="configured-tag"
                size="small"
                type="info"
                :bordered="false"
              >
                {{ t('network.interfaces.configured', 'Configured') }}
              </n-tag>
              <n-tag class="port-type-tag" size="small" :bordered="false">
                {{ networkInterface.port_type === 'physical'
                  ? t('network.interfaces.physicalPort', 'Physical')
                  : t('network.interfaces.virtualPort', 'Virtual') }}
              </n-tag>
              <n-tag size="small" :type="networkInterface.up ? 'success' : 'default'" :bordered="false">
                {{ networkInterface.up ? t('network.interfaces.up', 'Up') : t('network.interfaces.down', 'Down') }}
              </n-tag>
            </div>
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
                  <dd class="interface-addresses">
                    <span v-for="address in networkInterface.addresses" :key="address">{{ address }}</span>
                    <span v-if="networkInterface.addresses.length === 0">-</span>
                  </dd>
                </div>
              </dl>

              <WifiOnboarding v-if="networkInterface.kind === 'wifi_ap' && expanded === networkInterface.name" interface-name="ap0" @changed="load" />
              <WifiOnboarding v-else-if="networkInterface.kind === 'wifi_station' && expanded === networkInterface.name" interface-name="wlan0" @changed="load" />

              <n-form v-else-if="networkInterface.kind === 'wireguard'" label-placement="top" :show-feedback="false">
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
              <n-form v-else-if="isManagedTunnel(networkInterface)" label-placement="top" :show-feedback="false">
                <TunnelSettingsForm
                  :model-value="networkInterface.configuration"
                  :disabled="disabled"
                  @update:model-value="updateManagedInterface(networkInterface.managedIndex, $event)"
                  @remove="removeManagedInterface(networkInterface.managedIndex)"
                />
              </n-form>
              <n-form v-else-if="isVpnInterface(networkInterface)" label-placement="top" :show-feedback="false">
                <VpnSettingsForm
                  :model-value="networkInterface.configuration"
                  :disabled="disabled"
                  :parent-device="modelValue.device"
                  @update:model-value="updateVpn(networkInterface.vpnIndex, $event)"
                  @remove="removeVpn(networkInterface.vpnIndex)"
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
.network-interface-manager { display: grid; gap: 16px; }
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--foreground);
  font-size: 12px;
}
.list-toolbar > div { display: flex; align-items: center; gap: 4px; }
.settings-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--card);
}
.settings-list-item + .settings-list-item { border-top: 1px solid var(--border); }
.settings-list-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 14px;
  cursor: pointer;
}
.settings-list-row:hover,
.settings-list-row:focus-visible { background: var(--accent); outline: none; }
.settings-list-chevron { flex: 0 0 auto; color: var(--muted-foreground); transition: transform 160ms ease; }
.settings-list-chevron.expanded { transform: rotate(90deg); }
.settings-list-identity {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.settings-list-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; }
.settings-list-identity span { overflow: hidden; color: var(--muted-foreground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.settings-list-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.settings-list-detail { display: grid; gap: 18px; padding: 14px 16px 18px 37px; background: var(--onekvm-surface-inset); }
.modules-unavailable { margin-bottom: 12px; }
.interface-kind-icon { color: var(--muted-foreground); }
.interface-facts {
  display: grid;
  gap: 10px;
  margin: 0;
}
.interface-facts > div { display: grid; gap: 2px; }
.interface-facts dt { color: var(--muted-foreground); font-size: 11px; }
.interface-facts dd { margin: 0; font-size: 13px; }
.interface-addresses {
  display: grid;
  gap: 2px;
}
.interface-addresses span {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
@media (max-width: 760px) {
  .settings-list-row {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: start;
    gap: 8px 10px;
    padding: 14px 12px;
  }
  .settings-list-tags {
    grid-column: 3;
    justify-content: flex-start;
  }
  .settings-list-detail { padding: 14px 12px 18px 38px; }
  .settings-list-row :deep(.port-type-tag) { display: none; }
}
</style>

<style>
.network-add-interface-menu {
  max-height: min(24rem, calc(100vh - 12rem));
}
</style>
