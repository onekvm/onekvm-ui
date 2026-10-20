import { computed, shallowRef, watch, type Ref } from 'vue'
import { api, type SystemOnlineUpdateProgress, type SystemUpdatePreflight } from '@/api/client'
import { t } from '@/i18n/runtime'

/** Own the pending update and package transfer; the panel only renders it. */
export function useSystemUpdatePreflight(progress: Readonly<Ref<SystemOnlineUpdateProgress | null>>) {
  const plan = shallowRef<SystemUpdatePreflight | null>(null)
  const busy = shallowRef(false)
  const error = shallowRef('')
  const visible = computed(() => plan.value?.kernel_changed && plan.value.phase === 'prepared')
  let generation = 0

  async function refresh() {
    const current = ++generation
    try {
      const result = await api.getSystemUpdatePreflight()
      if (current === generation) { plan.value = result; error.value = '' }
    } catch (reason) {
      if (current === generation) error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  async function upload(files: File[]) {
    const id = plan.value?.id
    if (!id || busy.value) return
    busy.value = true
    error.value = ''
    ++generation
    try {
      for (const file of files) {
        if (!/\.ipks?$/i.test(file.name) || file.size === 0 || file.size > 32 * 1024 * 1024) {
          throw new Error(t('settings.advancedSettings.systemPage.pluginUpdate.invalidFile', 'Select a valid .ipk or .ipks file, up to 32 MiB per file'))
        }
        plan.value = await api.addSystemUpdatePackage(id, file)
      }
    } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
    finally { busy.value = false }
  }

  async function commit() {
    if (!plan.value?.id || !plan.value.ready || busy.value) return false
    busy.value = true
    error.value = ''
    try {
      await api.commitSystemUpdatePreflight(plan.value.id)
      plan.value = { ...plan.value, phase: 'armed' }
      return true
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      await refresh()
      // refresh() clears its own errors; retain the installation error.
      error.value = reason instanceof Error ? reason.message : String(reason)
      return false
    } finally { busy.value = false }
  }

  async function cancel() {
    if (!plan.value?.id || busy.value) return false
    busy.value = true
    error.value = ''
    try { plan.value = await api.cancelSystemUpdatePreflight(plan.value.id); return true }
    catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason); return false }
    finally { busy.value = false }
  }

  watch(() => progress.value?.phase, () => { if (!busy.value) void refresh() }, { immediate: true })
  return { plan, busy, error, visible, upload, commit, cancel }
}
