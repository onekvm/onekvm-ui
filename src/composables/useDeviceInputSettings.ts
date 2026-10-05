import { onMounted, readonly, shallowRef } from 'vue'

import { api, type InputConfig } from '@/api/client'

const DEFAULT_INPUT_CONFIG: InputConfig = {
  mouse_report_rate_hz: 60,
  mouse_scroll_interval_ms: 0,
}

interface DeviceInputSettingsOptions {
  onError?: (reason: unknown) => void
}

function normalizeInputConfig(config: InputConfig): InputConfig {
  return {
    mouse_report_rate_hz: Math.max(1, Math.min(1000, Math.round(config.mouse_report_rate_hz))),
    mouse_scroll_interval_ms: Math.max(0, Math.min(150, Math.round(config.mouse_scroll_interval_ms))),
  }
}

export function useDeviceInputSettings(options: DeviceInputSettingsOptions = {}) {
  const mouseReportRate = shallowRef(DEFAULT_INPUT_CONFIG.mouse_report_rate_hz)
  const scrollInterval = shallowRef(DEFAULT_INPUT_CONFIG.mouse_scroll_interval_ms)
  let lastSaved = { ...DEFAULT_INPUT_CONFIG }
  let loadPromise: Promise<void> = Promise.resolve()
  let saveQueue: Promise<void> = Promise.resolve()
  let revision = 0
  let touchedReportRate = false
  let touchedScrollInterval = false

  function apply(config: InputConfig) {
    const normalized = normalizeInputConfig(config)
    mouseReportRate.value = normalized.mouse_report_rate_hz
    scrollInterval.value = normalized.mouse_scroll_interval_ms
  }

  async function load() {
    try {
      const config = normalizeInputConfig(await api.getInputConfig())
      lastSaved = config
      if (!touchedReportRate) mouseReportRate.value = config.mouse_report_rate_hz
      if (!touchedScrollInterval) scrollInterval.value = config.mouse_scroll_interval_ms
    } catch (reason) {
      options.onError?.(reason)
    }
  }

  function save() {
    const requestedRevision = ++revision
    saveQueue = saveQueue.then(async () => {
      await loadPromise
      if (requestedRevision !== revision) return
      const desired = normalizeInputConfig({
        mouse_report_rate_hz: mouseReportRate.value,
        mouse_scroll_interval_ms: scrollInterval.value,
      })
      try {
        const saved = normalizeInputConfig(await api.saveInputConfig(desired))
        lastSaved = saved
        if (requestedRevision === revision) apply(saved)
      } catch (reason) {
        if (requestedRevision === revision) {
          apply(lastSaved)
          options.onError?.(reason)
        }
      }
    })
  }

  function updateMouseReportRate(value: number) {
    const next = Math.max(1, Math.min(1000, Math.round(value)))
    if (next === mouseReportRate.value) return
    touchedReportRate = true
    mouseReportRate.value = next
    save()
  }

  function updateScrollInterval(value: number) {
    const next = Math.max(0, Math.min(150, Math.round(value)))
    if (next === scrollInterval.value) return
    touchedScrollInterval = true
    scrollInterval.value = next
    save()
  }

  onMounted(() => {
    loadPromise = load()
  })

  return {
    mouseReportRate: readonly(mouseReportRate),
    scrollInterval: readonly(scrollInterval),
    updateMouseReportRate,
    updateScrollInterval,
  }
}
