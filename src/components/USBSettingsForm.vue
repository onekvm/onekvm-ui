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
const intervalValid = (value: number | undefined) => value == null || (Number.isInteger(value) && value >= 0 && value <= 255)

if (usb.value.gamepad == null) usb.value.gamepad = false
if (!usb.value.keyboard_name) usb.value.keyboard_name = 'Keyboard'
if (!usb.value.mouse_name) usb.value.mouse_name = 'Mouse'
if (usb.value.keyboard_interval == null) usb.value.keyboard_interval = 0
if (usb.value.mouse_interval == null) usb.value.mouse_interval = 0

const audioValid = ref(true)

const gadget = computed(() => props.gadget)
const hasBudget = computed(() => Boolean(gadget.value && (gadget.value.in_limit > 0 || gadget.value.out_limit > 0)))

function endpointUse(options: { audio?: boolean; gamepad?: boolean; keyboardOut?: boolean }) {
  const speaker = options.audio ?? Boolean(audio.value.enabled)
  const gamepadOn = options.gamepad ?? Boolean(usb.value.gamepad)
  const keyboardOut = options.keyboardOut ?? !usb.value.keyboard_no_out
  let inn = 3
  let out = keyboardOut ? 1 : 0
  if (gadget.value?.mass_storage) {
    inn += 1
    out += 1
  }
  if (speaker) {
    inn += 1
    out += 1
  }
  if (gamepadOn) inn += 1
  if (gadget.value?.mtp) {
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

function wouldFit(options: { audio?: boolean; gamepad?: boolean }) {
  if (!hasBudget.value || !gadget.value) return true
  const next = endpointUse(options)
  return next.inn <= gadget.value.in_limit && next.out <= gadget.value.out_limit
}

const audioBlocked = computed(() => !audio.value.enabled && !wouldFit({ audio: true }))
const gamepadBlocked = computed(() => !usb.value.gamepad && !wouldFit({ gamepad: true }))

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
  scsiStringValid(usb.value.storage_vendor, 8) &&
  scsiStringValid(usb.value.iso_product, 16) &&
  scsiStringValid(usb.value.drive_product, 16) &&
  audioValid.value,
)

watch(valid, (value) => emit('validity', value), { immediate: true })
</script>

<template>
  <div class="usb-settings">
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.usbPage.restartHint', 'USB identity and HID names take effect after OneKVM or the device is restarted. Enabling audio or the gamepad re-enumerates USB immediately.') }}
    </n-alert>

    <section v-if="hasBudget && gadget" class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.endpoints', 'UDC endpoints') }}</h2>
        <p>
          {{ t('settings.advancedSettings.usbPage.endpointsHint', 'Each USB device controller has a fixed number of IN and OUT endpoints. Extra functions such as audio, a gamepad, mass storage, or MTP share this budget.') }}
          <template v-if="gadget.udc"> {{ gadget.udc }}.</template>
        </p>
      </header>
      <dl class="usb-endpoint-budget">
        <div>
          <dt>IN</dt>
          <dd>{{ used.inn }} / {{ gadget.in_limit }}</dd>
        </div>
        <div>
          <dt>OUT</dt>
          <dd>{{ used.out }} / {{ gadget.out_limit }}</dd>
        </div>
      </dl>
      <n-alert v-if="overBudget" type="warning" :bordered="false">
        {{ t('settings.advancedSettings.usbPage.endpointsExceeded', 'This combination uses more endpoints than the controller provides. Disable audio, the gamepad, MTP, or the keyboard LED endpoint.') }}
      </n-alert>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.deviceIdentity', 'USB device identity') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.deviceIdentityHint', 'These descriptors identify the composite KVM device on the controlled host.') }}</p>
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
        <p>{{ t('settings.advancedSettings.usbPage.keyboardHint', 'Interface name and polling interval for the HID keyboard. Interval 0 keeps the kernel default. The LED endpoint is required for Num/Caps/Scroll Lock.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Interface name')">
          <n-input v-model:value="usb.keyboard_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.keyboard_name || '') ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.pollInterval', 'Polling interval (ms)')">
          <n-input-number v-model:value="usb.keyboard_interval" :disabled="props.disabled" :min="0" :max="255" :show-button="false" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.keyboardLeds', 'Keyboard LED endpoint')">
          <n-switch :value="!usb.keyboard_no_out" :disabled="props.disabled" @update:value="usb.keyboard_no_out = !$event" />
        </n-form-item>
      </n-form>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.mouseHint', 'Shared interface name and polling interval for the relative and absolute mouse functions.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.interfaceName', 'Interface name')">
          <n-input v-model:value="usb.mouse_name" :disabled="props.disabled" maxlength="126" :status="usbStringValid(usb.mouse_name || '') ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.pollInterval', 'Polling interval (ms)')">
          <n-input-number v-model:value="usb.mouse_interval" :disabled="props.disabled" :min="0" :max="255" :show-button="false" />
        </n-form-item>
      </n-form>
    </section>

    <AudioSettingsForm v-model="audio" :disabled="props.disabled || audioBlocked" @validity="audioValid = $event" />
    <n-alert v-if="audioBlocked" type="warning" :bordered="false">
      {{ t('settings.advancedSettings.usbPage.audioBlocked', 'USB audio needs one more IN and OUT endpoint than this controller has free.') }}
    </n-alert>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.gamepad', 'WebHID gamepad') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.gamepadHint', 'Adds a USB game pad to the composite gadget so a local controller can be forwarded through the browser. Saving this option re-enumerates USB on the controlled host.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false">
        <n-form-item :label="t('settings.advancedSettings.usbPage.gamepadEnable', 'Enable USB gamepad')">
          <n-switch v-model:value="usb.gamepad" :disabled="props.disabled || gamepadBlocked" />
        </n-form-item>
      </n-form>
      <n-alert v-if="gamepadBlocked" type="warning" :bordered="false">
        {{ t('settings.advancedSettings.usbPage.gamepadBlocked', 'The gamepad needs one more IN endpoint than this controller has free.') }}
      </n-alert>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.storageIdentity', 'Mass Storage identity') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.storageIdentityHint', 'SCSI Vendor is limited to 8 ASCII characters and Product to 16. They are padded into separate fixed-width fields.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="usb-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.usbPage.storageVendor', 'SCSI vendor')">
          <n-input v-model:value="usb.storage_vendor" :disabled="props.disabled" maxlength="8" :status="scsiStringValid(usb.storage_vendor, 8) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.isoProduct', 'Virtual ISO product')">
          <n-input v-model:value="usb.iso_product" :disabled="props.disabled" maxlength="16" :status="scsiStringValid(usb.iso_product, 16) ? undefined : 'error'" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.usbPage.driveProduct', 'Virtual storage product')">
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
</style>
