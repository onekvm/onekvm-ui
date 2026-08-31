<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { OneKVMConfig, OneKVMStatus, USBConfig } from '@/api/client'
import { t } from '@/i18n/runtime'

import AudioSettingsForm from './AudioSettingsForm.vue'

const props = defineProps<{
  disabled?: boolean
  gadget?: NonNullable<OneKVMStatus['hid']>['gadget']
}>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const usb = defineModel<USBConfig>({ required: true })
const audio = defineModel<OneKVMConfig['audio']>('audio', { required: true })

const idValid = (value: string) => /^(?:0x)?[0-9a-f]{4}$/i.test(value.trim())
const usbStringValid = (value: string, allowEmpty = false) =>
  (allowEmpty && value === '') || (value.length > 0 && new TextEncoder().encode(value).length <= 126 && !/[\u0000-\u001f\u007f]/.test(value))
const scsiStringValid = (value: string, maximum: number) =>
  value.length > 0 && value.length <= maximum && /^[\x20-\x7e]+$/.test(value)
const intervalValid = (value: number | null | undefined) => {
  const interval = value ?? 0
  return Number.isInteger(interval) && interval >= 0 && interval <= 255
}

function setInterval(field: 'keyboard_interval' | 'mouse_interval', value: number | null) {
  usb.value[field] = value ?? 0
}

if (usb.value.gamepad == null) usb.value.gamepad = false
if (usb.value.mass_storage == null) usb.value.mass_storage = true
if (usb.value.mtp == null) usb.value.mtp = true
if (audio.value.microphone == null) audio.value.microphone = false
if (!usb.value.keyboard_name) usb.value.keyboard_name = 'Keyboard'
if (!usb.value.mouse_name) usb.value.mouse_name = 'Mouse'
if (usb.value.keyboard_interval == null) usb.value.keyboard_interval = 0
if (usb.value.mouse_interval == null) usb.value.mouse_interval = 0

const audioValid = ref(true)

const gadget = computed(() => props.gadget)
const hasBudget = computed(() => Boolean(gadget.value && (gadget.value.in_limit > 0 || gadget.value.out_limit > 0)))

function endpointUse(options: { audio?: boolean; microphone?: boolean; gamepad?: boolean; keyboardOut?: boolean; storage?: boolean; mtp?: boolean }) {
  const speaker = options.audio ?? Boolean(audio.value.enabled)
  const microphoneOn = options.microphone ?? Boolean(audio.value.microphone)
  const gamepadOn = options.gamepad ?? Boolean(usb.value.gamepad)
  const keyboardOut = options.keyboardOut ?? !usb.value.keyboard_no_out
  const storageOn = options.storage ?? usb.value.mass_storage !== false
  const mtpOn = options.mtp ?? usb.value.mtp !== false
  let inn = 3
  let out = keyboardOut ? 1 : 0
  if ((gadget.value?.mass_storage ?? true) && storageOn) {
    inn += 1
    out += 1
  }
  if (speaker) {
    inn += 1
    out += 1
  }
  if (microphoneOn) inn += 1
  if (gamepadOn) inn += 1
  if ((gadget.value?.mtp_available ?? Boolean(gadget.value?.mtp)) && mtpOn) {
    inn += 2
    out += 1
  }
  return { inn, out }
}

const used = computed(() => endpointUse({}))
const overBudget = computed(() => {
  if (!hasBudget.value || !gadget.value) return false
  return used.value.inn > gadget.value.in_limit || used.value.out > gadget.value.out_limit
})

function wouldFit(options: { audio?: boolean; microphone?: boolean; gamepad?: boolean; storage?: boolean; mtp?: boolean }) {
  if (!hasBudget.value || !gadget.value) return true
  const next = endpointUse(options)
  return next.inn <= gadget.value.in_limit && next.out <= gadget.value.out_limit
}

const audioBlocked = computed(() => !audio.value.enabled && !wouldFit({ audio: true }))
const microphoneBlocked = computed(() => !audio.value.microphone && !wouldFit({ microphone: true }))
const gamepadBlocked = computed(() => !usb.value.gamepad && !wouldFit({ gamepad: true }))
const storageBlocked = computed(() => usb.value.mass_storage === false && !wouldFit({ storage: true }))
const mtpBlocked = computed(() => usb.value.mtp === false && !wouldFit({ mtp: true }))
const massStorageOn = computed({
  get: () => usb.value.mass_storage !== false,
  set: (value: boolean) => { usb.value.mass_storage = value },
})
const mtpOn = computed({
  get: () => usb.value.mtp !== false,
  set: (value: boolean) => { usb.value.mtp = value },
})
const microphoneOn = computed({
  get: () => Boolean(audio.value.microphone),
  set: (value: boolean) => { audio.value.microphone = value },
})
const showMassStorage = computed(() => gadget.value?.mass_storage !== false)
const showMTP = computed(() => Boolean(gadget.value?.mtp_available))

const valid = computed(() =>
  idValid(usb.value.vendor_id) &&
  idValid(usb.value.product_id) &&
  usbStringValid(usb.value.manufacturer) &&
  usbStringValid(usb.value.product) &&
  usbStringValid(usb.value.serial_number, true) &&
  usbStringValid(usb.value.configuration) &&
  usbStringValid(usb.value.keyboard_name || '') &&
  usbStringValid(usb.value.mouse_name || '') &&
  intervalValid(usb.value.keyboard_interval) &&
  intervalValid(usb.value.mouse_interval) &&
  (usb.value.mass_storage === false || (
    scsiStringValid(usb.value.storage_vendor, 8) &&
    scsiStringValid(usb.value.iso_product, 16) &&
    scsiStringValid(usb.value.drive_product, 16)
  )) &&
  audioValid.value &&
  !overBudget.value,
)

watch(valid, (value) => emit('validity', value), { immediate: true })
watch(() => [audio.value.enabled, audio.value.microphone] as const, ([speaker, microphone]) => {
  if (!speaker && !microphone) audioValid.value = true
})

const keyboardLeds = computed({
  get: () => !usb.value.keyboard_no_out,
  set: (value: boolean) => { usb.value.keyboard_no_out = !value },
})
</script>

<template>
  <div class="usb-settings">
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.usbPage.restartHint', 'Turning functions on or off, or changing the names below, reconfigures USB immediately. The keyboard and mouse disconnect briefly.') }}
    </n-alert>

    <section v-if="hasBudget && gadget" class="usb-settings-card" :title="gadget.udc || undefined">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.endpoints', 'USB capacity') }}</h2>
        <p>
          {{ t('settings.advancedSettings.usbPage.endpointsHint', 'This USB port can only run so many extras at once. Audio, the gamepad, virtual storage, and file transfer all use capacity. If you run out, turn off what you are not using.') }}
        </p>
      </header>
      <dl class="usb-endpoint-budget">
        <div>
          <dt>{{ t('settings.advancedSettings.usbPage.endpointsIn', 'Upstream') }}</dt>
          <dd>{{ used.inn }} / {{ gadget.in_limit }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.advancedSettings.usbPage.endpointsOut', 'Downstream') }}</dt>
          <dd>{{ used.out }} / {{ gadget.out_limit }}</dd>
        </div>
      </dl>
      <n-alert v-if="overBudget" type="warning" :bordered="false">
        {{ t('settings.advancedSettings.usbPage.endpointsExceeded', 'Too many functions are on. Turn off audio, the gamepad, virtual storage, file transfer, or keyboard lights.') }}
      </n-alert>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.functions', 'USB functions') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.functionsHint', 'Choose what the controlled computer can use. Keyboard and mouse stay on. Turn something off and that computer will not see it.') }}</p>
      </header>
      <ul class="usb-function-list">
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboard', 'USB keyboard') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always available on the controlled computer.') }}</small>
          </div>
          <n-switch :value="true" disabled />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always available on the controlled computer.') }}</small>
          </div>
          <n-switch :value="true" disabled />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboardLeds', 'Keyboard lights') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.keyboardLedsHint', 'Shows Num Lock, Caps Lock, and Scroll Lock from the controlled computer.') }}</small>
          </div>
          <n-switch v-model:value="keyboardLeds" :disabled="props.disabled" />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.audioPage.title', 'USB audio') }}</strong>
            <small>{{ t('settings.advancedSettings.audioPage.hint', 'Lets the controlled computer use OneKVM as a speaker. The console Audio button appears after you turn this on.') }}</small>
          </div>
          <n-tooltip :disabled="!audioBlocked" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch v-model:value="audio.enabled" :disabled="props.disabled || audioBlocked" />
              </span>
            </template>
            {{ t('settings.advancedSettings.usbPage.audioBlocked', 'Not enough USB capacity. Turn off the gamepad, microphone, virtual storage, or file transfer first.') }}
          </n-tooltip>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.microphone', 'USB microphone') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.microphoneHint', 'Lets the controlled computer use OneKVM as a microphone. Turn it off and that computer will not see a microphone.') }}</small>
          </div>
          <n-tooltip :disabled="!microphoneBlocked" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch v-model:value="microphoneOn" :disabled="props.disabled || microphoneBlocked" />
              </span>
            </template>
            {{ t('settings.advancedSettings.usbPage.microphoneBlocked', 'Not enough USB capacity. Turn off the speaker, gamepad, virtual storage, or file transfer first.') }}
          </n-tooltip>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.gamepad', 'Gamepad') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.gamepadHint', 'Forwards a gamepad from this computer to the controlled computer through the browser. Turning it on or off makes that computer rediscover USB briefly.') }}</small>
          </div>
          <n-tooltip :disabled="!gamepadBlocked" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch v-model:value="usb.gamepad" :disabled="props.disabled || gamepadBlocked" />
              </span>
            </template>
            {{ t('settings.advancedSettings.usbPage.gamepadBlocked', 'Not enough USB capacity. Turn off audio, the microphone, virtual storage, or file transfer first.') }}
          </n-tooltip>
        </li>
        <li v-if="showMassStorage">
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.storage', 'Virtual storage') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.storageHint', 'Lets you mount a disc image or a virtual USB drive on the controlled computer. Turn it off and that computer will not see any storage.') }}</small>
          </div>
          <n-tooltip :disabled="!storageBlocked" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch v-model:value="massStorageOn" :disabled="props.disabled || storageBlocked" />
              </span>
            </template>
            {{ t('settings.advancedSettings.usbPage.storageBlocked', 'Not enough USB capacity. Turn off audio, the microphone, the gamepad, or file transfer first.') }}
          </n-tooltip>
        </li>
        <li v-if="showMTP">
          <div>
            <strong>{{ t('virtualMedia.mtpTab', 'File transfer') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.mtpHint', 'Share the virtual-media folder with the controlled computer, like plugging in a phone. Turn it off and that computer will not see this feature.') }}</small>
          </div>
          <n-tooltip :disabled="!mtpBlocked" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch v-model:value="mtpOn" :disabled="props.disabled || mtpBlocked" />
              </span>
            </template>
            {{ t('settings.advancedSettings.usbPage.mtpBlocked', 'Not enough USB capacity. Turn off audio, the microphone, the gamepad, or virtual storage first.') }}
          </n-tooltip>
        </li>
      </ul>
    </section>

    <AudioSettingsForm
      v-if="audio.enabled || audio.microphone"
      v-model="audio"
      :show-enable="false"
      :disabled="props.disabled || audioBlocked || microphoneBlocked"
      @validity="audioValid = $event"
    />

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.deviceIdentity', 'Name shown on the computer') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.deviceIdentityHint', 'The controlled computer shows these names in its device list. You can usually leave them as they are.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item label="VID">
          <n-input v-model:value="usb.vendor_id" :disabled="props.disabled" maxlength="6" placeholder="0x1d6b" :status="idValid(usb.vendor_id) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item label="PID">
          <n-input v-model:value="usb.product_id" :disabled="props.disabled" maxlength="6" placeholder="0x0104" :status="idValid(usb.product_id) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.manufacturer', 'Manufacturer')">
          <n-input v-model:value="usb.manufacturer" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.manufacturer) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.product', 'Product name')">
          <n-input v-model:value="usb.product" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.product) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.serial', 'Serial number')">
          <n-input v-model:value="usb.serial_number" :disabled="props.disabled" maxlength="126" :placeholder="t('settings.advancedSettings.usbPage.deviceID', 'Use device ID')" :status="usbStringValid(usb.serial_number, true) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.configuration', 'Configuration name')">
          <n-input v-model:value="usb.configuration" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.configuration) ? undefined : 'error'" />
        </n-form-item>
      </n-form>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.keyboard', 'USB keyboard') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.keyboardHint', 'The keyboard name shown on the controlled computer. Leave the refresh interval at 0 unless you have a reason to change it.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Display name')">
          <n-input v-model:value="usb.keyboard_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.keyboard_name || '') ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.pollInterval', 'Refresh interval (ms)')">
          <n-input-number :value="usb.keyboard_interval ?? 0" :disabled="props.disabled" :min="0" :max="255" :show-button="false" @update:value="setInterval('keyboard_interval', $event)" />
        </n-form-item>
      </n-form>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.mouseHint', 'The mouse name shown on the controlled computer. Leave the refresh interval at 0 unless you have a reason to change it.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Display name')">
          <n-input v-model:value="usb.mouse_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.mouse_name || '') ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.pollInterval', 'Refresh interval (ms)')">
          <n-input-number :value="usb.mouse_interval ?? 0" :disabled="props.disabled" :min="0" :max="255" :show-button="false" @update:value="setInterval('mouse_interval', $event)" />
        </n-form-item>
      </n-form>
    </section>

    <section v-if="massStorageOn" class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.storageIdentity', 'Virtual drive names') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.storageIdentityHint', 'Names the controlled computer shows for the virtual disc and USB drive. Vendor is up to 8 letters or numbers; product names up to 16.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.storageVendor', 'Vendor name')">
          <n-input v-model:value="usb.storage_vendor" :disabled="props.disabled" maxlength="8" :status="scsiStringValid(usb.storage_vendor, 8) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.isoProduct', 'Virtual disc name')">
          <n-input v-model:value="usb.iso_product" :disabled="props.disabled" maxlength="16" :status="scsiStringValid(usb.iso_product, 16) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.driveProduct', 'Virtual USB drive name')">
          <n-input v-model:value="usb.drive_product" :disabled="props.disabled" maxlength="16" :status="scsiStringValid(usb.drive_product, 16) ? undefined : 'error'" />
        </n-form-item>
      </n-form>
    </section>
  </div>
</template>

<style scoped>
.usb-settings { display: grid; gap: 16px; }
.usb-settings-card { display: grid; gap: 14px; padding: 16px; border: 1px solid #30363d; border-radius: 7px; background: #14191e; }
.usb-settings-card header h2 { margin: 0; font-size: 14px; }
.usb-settings-card header p { margin: 5px 0 0; color: #8f99a3; font-size: 11px; }
.usb-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.usb-endpoint-budget { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
.usb-endpoint-budget dt { color: #8f99a3; font-size: 11px; }
.usb-endpoint-budget dd { margin: 2px 0 0; font-size: 18px; font-variant-numeric: tabular-nums; }
.usb-function-list { display: grid; margin: 0; padding: 0; list-style: none; }
.usb-function-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid #30363d;
}
.usb-function-list li:first-child { padding-top: 0; border-top: 0; }
.usb-function-list strong { font-size: 13px; }
.usb-function-list small { display: block; margin-top: 3px; color: #8f99a3; font-size: 11px; line-height: 1.45; }
.usb-function-switch { display: inline-flex; align-items: center; }
</style>
