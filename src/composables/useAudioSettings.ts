import { computed, shallowRef, watch } from 'vue'

import { t } from '@/i18n/runtime'

export type AudioFormat = 'opus' | 'pcm'
export type OpusQuality = 'low' | 'medium' | 'high'
export type AudioQuality = OpusQuality | 'pcm'

export function useAudioSettings(getQuality: () => string | undefined) {
  const opusQuality = shallowRef<OpusQuality>('medium')

  watch(getQuality, (value) => {
    if (value === 'low' || value === 'medium' || value === 'high') opusQuality.value = value
  }, { immediate: true })

  const format = computed<AudioFormat>(() => getQuality() === 'pcm' ? 'pcm' : 'opus')
  const quality = computed<AudioQuality>(() => format.value === 'pcm' ? 'pcm' : opusQuality.value)
  const formatOptions = computed(() => [
    { label: t('usbAudio.formatOpus', 'Opus (save bandwidth)'), value: 'opus' },
    { label: t('usbAudio.formatPCM', 'PCM (lower CPU use)'), value: 'pcm' },
  ])
  const qualityOptions = computed(() => format.value === 'pcm'
    ? [{ label: t('settings.advancedSettings.audioPage.qualityPCM', 'Original (48 kHz / 16-bit, lossless)'), value: 'pcm' }]
    : [
        { label: t('settings.advancedSettings.audioPage.qualityLow', 'Low (48 kbps)'), value: 'low' },
        { label: t('settings.advancedSettings.audioPage.qualityMedium', 'Medium (96 kbps)'), value: 'medium' },
        { label: t('settings.advancedSettings.audioPage.qualityHigh', 'High (160 kbps)'), value: 'high' },
      ])
  const formatHint = computed(() => format.value === 'pcm'
    ? t('usbAudio.pcmHint', 'PCM preserves the original audio and uses less CPU. Bandwidth is typically about 10–50× that of Opus. Fast lossless compression is enabled by default; actual usage varies with the audio.')
    : t('usbAudio.opusHint', 'Opus uses less bandwidth. Choose the audio quality below; higher quality uses more bandwidth.'))

  function qualityForFormat(value: AudioFormat): AudioQuality {
    return value === 'pcm' ? 'pcm' : opusQuality.value
  }

  return { format, quality, formatOptions, qualityOptions, formatHint, qualityForFormat }
}
