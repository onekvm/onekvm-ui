<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Captions, Film, Fingerprint, Keyboard, Monitor, Plug, Power, Video, Volume2 } from '@/icons'
import { t } from '@/i18n/runtime'
import IconDescriptionList from './IconDescriptionList.vue'
import PluginDetailsSectionTitle from './PluginDetailsSectionTitle.vue'

const props = defineProps<{ capabilities: readonly string[] }>()
const capabilityMetadata: Readonly<Record<string, { key: string; icon: Component }>> = {
  'video.webrtc': { key: 'webrtc', icon: Video },
  'video.encoded': { key: 'encodedVideo', icon: Film },
  'video.mjpeg': { key: 'mjpeg', icon: Film },
  'video.encode': { key: 'videoEncoding', icon: Film },
  'video.ocr': { key: 'ocr', icon: Captions },
  'video.display': { key: 'display', icon: Monitor },
  'audio.encoded': { key: 'encodedAudio', icon: Volume2 },
  hid: { key: 'hid', icon: Keyboard },
  atx: { key: 'atx', icon: Power },
  auth: { key: 'auth', icon: Fingerprint },
}

const items = computed(() => props.capabilities.map(id => {
  if (Object.prototype.hasOwnProperty.call(capabilityMetadata, id)) {
    const metadata = capabilityMetadata[id]
    return {
      id: `capability:${id}`,
      icon: metadata.icon,
      label: t(`settings.plugins.capabilityDetails.${metadata.key}.label`),
      description: t(`settings.plugins.capabilityDetails.${metadata.key}.description`),
    }
  }
  return {
    id: `capability:${id}`,
    icon: Plug,
    label: id,
    description: t('settings.plugins.capabilityDetails.unknownDescription', 'This plugin requests access to this OneKVM capability. No description is available in this version.'),
  }
}))
</script>

<template>
  <section class="plugin-capabilities" data-declaration="capabilities" aria-labelledby="plugin-capabilities-title">
    <PluginDetailsSectionTitle id="plugin-capabilities-title" :icon="Plug">{{ t('settings.plugins.usedCapabilities', 'Core capabilities used') }}</PluginDetailsSectionTitle>
    <IconDescriptionList :items="items" />
  </section>
</template>

<style scoped>
.plugin-capabilities { display: grid; gap: 8px; }
</style>
