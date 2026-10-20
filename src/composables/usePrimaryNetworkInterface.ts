import { computed, type Ref } from 'vue'
import type { NetworkConfig } from '@/api/client'
import { physicalInterfaceConfig, updatePrimaryInterface } from '@/lib/network'

export function usePrimaryNetworkInterface(network: Ref<NetworkConfig>) {
  return computed({
    get: () => physicalInterfaceConfig(network.value, network.value.primary_interface),
    set: value => { network.value = updatePrimaryInterface(network.value, value) },
  })
}
