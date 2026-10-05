<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { OneKVMConfig, OneKVMStatus, USBConfig } from '@/api/client'
import { t } from '@/i18n/runtime'

import AudioSettingsForm from './AudioSettingsForm.vue'
import USBCapacityBadge from './USBCapacityBadge.vue'

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

const endpointCosts = {
  keyboard: { inn: 1, out: 0 },
  mouse: { inn: 2, out: 0 },
  keyboardLeds: { inn: 0, out: 1 },
  audio: { inn: 0, out: 1 },
  microphone: { inn: 1, out: 0 },
  gamepad: { inn: 1, out: 0 },
  storage: { inn: 1, out: 1 },
  mtp: { inn: 2, out: 1 },
} as const

function endpointUse(options: { audio?: boolean; microphone?: boolean; gamepad?: boolean; keyboardOut?: boolean; storage?: boolean; mtp?: boolean }) {
  const speaker = options.audio ?? Boolean(audio.value.enabled)
  const microphoneOn = options.microphone ?? Boolean(audio.value.microphone)
  const gamepadOn = options.gamepad ?? Boolean(usb.value.gamepad)
  const keyboardOut = options.keyboardOut ?? !usb.value.keyboard_no_out
  const storageOn = options.storage ?? usb.value.mass_storage !== false
  const mtpOn = options.mtp ?? usb.value.mtp !== false
  let inn: number = endpointCosts.keyboard.inn + endpointCosts.mouse.inn
  let out = 0
  function add(feature: keyof typeof endpointCosts) {
    inn += endpointCosts[feature].inn
    out += endpointCosts[feature].out
  }
  if (keyboardOut) add('keyboardLeds')
  if ((gadget.value?.mass_storage ?? true) && storageOn) {
    add('storage')
  }
  if (speaker) {
    add('audio')
  }
  if (microphoneOn) add('microphone')
  if (gamepadOn) add('gamepad')
  if ((gadget.value?.mtp_available ?? Boolean(gadget.value?.mtp)) && mtpOn) {
    add('mtp')
  }
  return { inn, out }
}

const used = computed(() => endpointUse({}))
const totalCapacity = computed(() => ({ inn: gadget.value?.in_limit ?? 0, out: gadget.value?.out_limit ?? 0 }))
const capacityUsed = computed(() => used.value.inn + used.value.out)
const capacityTotal = computed(() => totalCapacity.value.inn + totalCapacity.value.out)
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
        <h2 class="usb-capacity-heading">
          {{ t('settings.advancedSettings.usbPage.endpoints', 'USB capacity') }}
          <USBCapacityBadge
            :endpoints="totalCapacity"
            :label="t('settings.advancedSettings.usbPage.capacitySupported', 'This device supports {count} USB capacity units ({in} upstream, {out} downstream).')"
          />
        </h2>
        <p>
          {{ t('settings.advancedSettings.usbPage.endpointsHint', 'The numbers beside the lightning show USB endpoint counts: ↑ upstream, ↓ downstream. Each direction has its own limit; turn off unused functions when either is full.') }}
        </p>
      </header>
      <dl class="usb-endpoint-budget">
        <div class="usb-capacity-total" :class="{ 'usb-capacity-exceeded': overBudget }">
          <dt>{{ t('settings.advancedSettings.usbPage.capacityUsage', 'Used / supported') }}</dt>
          <dd>{{ capacityUsed }} / {{ capacityTotal }}</dd>
        </div>
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
        <p>{{ t('settings.advancedSettings.usbPage.functionsHint', 'Choose what the controlled device can use. Keyboard and mouse stay on. Turn something off and that device will not see it.') }}</p>
      </header>
      <ul class="usb-function-list">
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboard', 'USB keyboard') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always on and cannot be turned off.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.keyboard" />
            <n-switch :value="true" disabled />
          </div>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always on and cannot be turned off.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.mouse" />
            <n-switch :value="true" disabled />
          </div>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboardLeds', 'Keyboard lights') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.keyboardLedsHint', 'Shows Num Lock, Caps Lock, and Scroll Lock from the controlled device.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.keyboardLeds" />
            <n-switch v-model:value="keyboardLeds" :disabled="props.disabled" />
          </div>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.audioPage.title', 'USB audio') }}</strong>
            <small>{{ t('settings.advancedSettings.audioPage.hint', 'The controlled device will see OneKVM as a speaker. The console Audio button appears after you turn this on.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.audio" />
            <n-tooltip :disabled="!audioBlocked" placement="left">
              <template #trigger>
                <span class="usb-function-switch">
                  <n-switch v-model:value="audio.enabled" :disabled="props.disabled || audioBlocked" />
                </span>
              </template>
              {{ t('settings.advancedSettings.usbPage.audioBlocked', 'Not enough USB capacity. Turn off the gamepad, microphone, virtual storage, or file transfer first.') }}
            </n-tooltip>
          </div>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.microphone', 'USB microphone') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.microphoneHint', 'Forwards this browser’s microphone to the controlled device. Turn it off and that device will not see a microphone.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.microphone" />
            <n-tooltip :disabled="!microphoneBlocked" placement="left">
              <template #trigger>
                <span class="usb-function-switch">
                  <n-switch v-model:value="microphoneOn" :disabled="props.disabled || microphoneBlocked" />
                </span>
              </template>
              {{ t('settings.advancedSettings.usbPage.microphoneBlocked', 'Not enough USB capacity. Turn off the speaker, gamepad, virtual storage, or file transfer first.') }}
            </n-tooltip>
          </div>
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.gamepad', 'Gamepad') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.gamepadHint', 'Forwards a gamepad from this computer to the controlled device through the browser. Turning it on or off disconnects USB briefly.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.gamepad" />
            <n-tooltip :disabled="!gamepadBlocked" placement="left">
              <template #trigger>
                <span class="usb-function-switch">
                  <n-switch v-model:value="usb.gamepad" :disabled="props.disabled || gamepadBlocked" />
                </span>
              </template>
              {{ t('settings.advancedSettings.usbPage.gamepadBlocked', 'Not enough USB capacity. Turn off audio, the microphone, virtual storage, or file transfer first.') }}
            </n-tooltip>
          </div>
        </li>
        <li v-if="showMassStorage">
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.storage', 'Virtual storage') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.storageHint', 'Lets you mount a disc image or a virtual disk on the controlled device. Turn it off and that device will not see any storage.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.storage" />
            <n-tooltip :disabled="!storageBlocked" placement="left">
              <template #trigger>
                <span class="usb-function-switch">
                  <n-switch v-model:value="massStorageOn" :disabled="props.disabled || storageBlocked" />
                </span>
              </template>
              {{ t('settings.advancedSettings.usbPage.storageBlocked', 'Not enough USB capacity. Turn off audio, the microphone, the gamepad, or file transfer first.') }}
            </n-tooltip>
          </div>
        </li>
        <li v-if="showMTP">
          <div>
            <strong>{{ t('virtualMedia.mtpTab', 'File transfer') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.mtpHint', 'Share the virtual-media folder with the controlled device, like plugging in a phone. Turn it off and that device will not see this feature.') }}</small>
          </div>
          <div class="usb-function-controls">
            <USBCapacityBadge :endpoints="endpointCosts.mtp" />
            <n-tooltip :disabled="!mtpBlocked" placement="left">
              <template #trigger>
                <span class="usb-function-switch">
                  <n-switch v-model:value="mtpOn" :disabled="props.disabled || mtpBlocked" />
                </span>
              </template>
              {{ t('settings.advancedSettings.usbPage.mtpBlocked', 'Not enough USB capacity. Turn off audio, the microphone, the gamepad, or virtual storage first.') }}
            </n-tooltip>
          </div>
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
        <h2>{{ t('settings.advancedSettings.usbPage.deviceIdentity', 'Name shown on the device') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.deviceIdentityHint', 'The controlled device shows these names in its system information. You can usually leave them as they are.') }}</p>
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
        <p>{{ t('settings.advancedSettings.usbPage.keyboardHint', 'The keyboard name shown on the controlled device.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Display name')">
          <n-input v-model:value="usb.keyboard_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.keyboard_name || '') ? undefined : 'error'" />
        </n-form-item>
      </n-form>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.mouseHint', 'The mouse name shown on the controlled device.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Display name')">
          <n-input v-model:value="usb.mouse_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.mouse_name || '') ? undefined : 'error'" />
        </n-form-item>
      </n-form>
    </section>

    <section v-if="massStorageOn" class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.storageIdentity', 'Virtual drive names') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.storageIdentityHint', 'Names the controlled device shows for the virtual disc and disk. Vendor is up to 8 letters or numbers; product names up to 16.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.storageVendor', 'Vendor name')">
          <n-input v-model:value="usb.storage_vendor" :disabled="props.disabled" maxlength="8" :status="scsiStringValid(usb.storage_vendor, 8) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.isoProduct', 'Virtual disc name')">
          <n-input v-model:value="usb.iso_product" :disabled="props.disabled" maxlength="16" :status="scsiStringValid(usb.iso_product, 16) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.driveProduct', 'Virtual disk name')">
          <n-input v-model:value="usb.drive_product" :disabled="props.disabled" maxlength="16" :status="scsiStringValid(usb.drive_product, 16) ? undefined : 'error'" />
        </n-form-item>
      </n-form>
    </section>
  </div>
</template>

<style scoped>
.usb-settings { display: grid; gap: 18px; }
.usb-settings-card { display: grid; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
.usb-settings-card header h2 { margin: 0; font-size: 14px; }
.usb-settings-card header p { margin: 5px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.usb-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.usb-settings-grid :deep(.n-form-item) { margin-bottom: 0; }
.usb-capacity-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.usb-endpoint-budget { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
.usb-endpoint-budget dt { color: var(--muted-foreground); font-size: 11px; }
.usb-endpoint-budget dd { margin: 2px 0 0; font-size: 18px; font-variant-numeric: tabular-nums; }
.usb-capacity-total dd { font-weight: 600; }
.usb-capacity-exceeded dd { color: var(--warning); }
.usb-function-list { display: grid; margin: 0; padding: 0; list-style: none; }
.usb-function-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 0;
  border-top: 1px solid var(--border);
}
.usb-function-list li:first-child { padding-top: 0; border-top: 0; }
.usb-function-list strong { font-size: 13px; }
.usb-function-list small { display: block; margin-top: 3px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.usb-function-controls { display: inline-flex; align-items: center; gap: 8px; }
.usb-function-switch { display: inline-flex; align-items: center; }

@media (max-width: 760px) {
  .usb-settings-card { padding: 16px 14px; }
  .usb-endpoint-budget { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .usb-capacity-total { grid-column: 1 / -1; }
  .usb-function-list li { align-items: start; min-height: 56px; }
}
</style>
