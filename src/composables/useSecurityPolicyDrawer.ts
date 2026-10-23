import { computed, ref, shallowRef, toRaw, type Ref } from 'vue'
import { validSecuritySettings, type SecuritySettingsForm } from './useSecuritySettings'

export type SecurityPolicy = 'login' | 'api' | 'proxy'
const fields: Record<SecurityPolicy, (keyof SecuritySettingsForm)[]> = {
  login: ['maxFailures', 'banDurationHours', 'scope', 'ipv4Prefix', 'ipv6Prefix', 'blockWeakCredentials'],
  api: ['apiMaxFailures', 'apiBanDurationSeconds', 'apiScope', 'apiIpv4Prefix', 'apiIpv6Prefix', 'apiWindowSeconds', 'apiRequestsPerSecond', 'apiBurst'],
  proxy: ['reverseProxy'],
}

function copy(form: SecuritySettingsForm) { return structuredClone(toRaw(form)) }

export function useSecurityPolicyDrawer(form: Ref<SecuritySettingsForm | null>, save: () => Promise<boolean>) {
  const show = shallowRef(false)
  const policy = shallowRef<SecurityPolicy>('login')
  const draft = ref<SecuritySettingsForm | null>(null)
  const baseline = shallowRef('')
  const pick = (value: SecuritySettingsForm) => Object.fromEntries(fields[policy.value].map(key => [key, value[key]]))
  const dirty = computed(() => draft.value !== null && JSON.stringify(pick(draft.value)) !== baseline.value)
  const valid = computed(() => validSecuritySettings(draft.value))

  function open(value: SecurityPolicy) {
    if (!form.value) return
    policy.value = value
    draft.value = copy(form.value)
    baseline.value = JSON.stringify(pick(draft.value))
    show.value = true
  }

  async function apply() {
    if (!form.value || !draft.value || !valid.value || !dirty.value) return
    const previous = pick(copy(form.value))
    Object.assign(form.value, pick(copy(draft.value)))
    if (await save()) show.value = false
    else if (form.value) Object.assign(form.value, previous)
  }

  return { show, policy, draft, dirty, valid, open, apply }
}
