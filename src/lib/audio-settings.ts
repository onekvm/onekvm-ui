import type { OneKVMConfig } from '../api/client'

export type AudioConfig = OneKVMConfig['audio']
export type AudioInputSource = 'usb' | 'hdmi'

export function audioPlaybackAvailable(audio: {
  enabled?: boolean
  source?: AudioInputSource
  sources?: readonly AudioInputSource[]
}) {
  return Boolean(audio.enabled) || audio.source === 'hdmi' || Boolean(audio.sources?.includes('hdmi'))
}

export function normalizeAudioConfig(audio: AudioConfig): AudioConfig {
  return { ...audio, source: audio.source || 'usb', microphone: audio.microphone ?? false,
    quality: audio.quality || 'medium', channels: audio.channels || 'stereo', product_name: audio.product_name || 'OneKVM Audio' }
}

export function audioConfigPatch(base: AudioConfig, draft: AudioConfig): Partial<AudioConfig> {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== base[key as keyof AudioConfig]))
}
