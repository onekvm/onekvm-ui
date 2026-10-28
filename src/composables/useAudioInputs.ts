import { computed } from 'vue'
import { t } from '@/i18n/runtime'
import type { AudioInputSource } from '@/lib/audio-settings'

export function useAudioInputs(getSources: () => readonly AudioInputSource[] | undefined, getSelected: () => AudioInputSource | undefined) {
  const sourceSelectionDisabled = computed(() => !(getSources() ?? ['usb']).includes('hdmi'))
  const sourceOptions = computed(() => {
    const available = getSources() ?? ['usb']
    const selected = getSelected() || 'usb'
    return [...new Set([...available, selected])].map(source => ({
      value: source,
      label: source === 'hdmi' ? t('usbAudio.sourceHDMI', 'HDMI audio') : t('usbAudio.sourceUSB', 'USB audio'),
      disabled: !available.includes(source),
    }))
  })
  return { sourceOptions, sourceSelectionDisabled }
}
