import type { OneKVMConfig } from '../api/client'

export type AudioConfig = OneKVMConfig['audio']
export type AudioInputSource = 'usb' | 'hdmi'

export function normalizeAudioConfig(audio: AudioConfig): AudioConfig {
  return { ...audio, source: audio.source || 'usb', microphone: audio.microphone ?? false,
    quality: audio.quality || 'medium', channels: audio.channels || 'stereo', product_name: audio.product_name || 'OneKVM Audio' }
}

export function audioConfigPatch(base: AudioConfig, draft: AudioConfig): Partial<AudioConfig> {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== base[key as keyof AudioConfig]))
}
