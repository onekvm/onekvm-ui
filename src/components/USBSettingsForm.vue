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
if (!usb.value.keyboard_name) usb.value.keyboard_name = 'Keyboard'
if (!usb.value.mouse_name) usb.value.mouse_name = 'Mouse'
if (usb.value.keyboard_interval == null) usb.value.keyboard_interval = 0
if (usb.value.mouse_interval == null) usb.value.mouse_interval = 0

const audioValid = ref(true)

const gadget = computed(() => props.gadget)
const hasBudget = computed(() => Boolean(gadget.value && (gadget.value.in_limit > 0 || gadget.value.out_limit > 0)))

function endpointUse(options: { audio?: boolean; gamepad?: boolean; keyboardOut?: boolean; storage?: boolean; mtp?: boolean }) {
  const speaker = options.audio ?? Boolean(audio.value.enabled)
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

function wouldFit(options: { audio?: boolean; gamepad?: boolean; storage?: boolean; mtp?: boolean }) {
  if (!hasBudget.value || !gadget.value) return true
  const next = endpointUse(options)
  return next.inn <= gadget.value.in_limit && next.out <= gadget.value.out_limit
}

const audioBlocked = computed(() => !audio.value.enabled && !wouldFit({ audio: true }))
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
watch(() => audio.value.enabled, (enabled) => {
  if (!enabled) audioValid.value = true
})

const keyboardLeds = computed({
  get: () => !usb.value.keyboard_no_out,
  set: (value: boolean) => { usb.value.keyboard_no_out = !value },
})
</script>

<template>
  <div class="usb-settings">
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.usbPage.restartHint', 'USB identity and HID names take effect after OneKVM or the device is restarted. Changing audio, the gamepad, virtual storage, or MTP re-enumerates USB immediately.') }}
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
        {{ t('settings.advancedSettings.usbPage.endpointsExceeded', 'This combination uses more endpoints than the controller provides. Disable audio, the gamepad, virtual storage, MTP, or the keyboard LED endpoint.') }}
      </n-alert>
    </section>

    <section class="usb-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.usbPage.functions', 'USB functions') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.functionsHint', 'Turn gadget functions on or off. Keyboard and mouse stay on. Turning off virtual storage or MTP removes that function from the gadget.') }}</p>
      </header>
      <ul class="usb-function-list">
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboard', 'USB keyboard') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always presented to the controlled host.') }}</small>
          </div>
          <n-switch :value="true" disabled />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.mouse', 'USB mouse') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.alwaysOnHint', 'Always presented to the controlled host.') }}</small>
          </div>
          <n-switch :value="true" disabled />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.keyboardLeds', 'Keyboard LED endpoint') }}</strong>
            <small>{{ t('settings.advancedSettings.usbPage.keyboardLedsHint', 'Required for Num Lock, Caps Lock, and Scroll Lock on the controlled host.') }}</small>
          </div>
          <n-switch v-model:value="keyboardLeds" :disabled="props.disabled" />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.audioPage.title', 'USB audio') }}</strong>
            <small>{{ audioBlocked ? t('settings.advancedSettings.usbPage.audioBlocked', 'USB audio needs one more IN and OUT endpoint than this controller has free.') : t('settings.advancedSettings.audioPage.hint', 'Presents a USB speaker to the target PC. The console Audio control appears after this is enabled.') }}</small>
          </div>
          <n-switch v-model:value="audio.enabled" :disabled="props.disabled || audioBlocked" />
        </li>
        <li>
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.gamepad', 'WebHID gamepad') }}</strong>
            <small>{{ gamepadBlocked ? t('settings.advancedSettings.usbPage.gamepadBlocked', 'The gamepad needs one more IN endpoint than this controller has free.') : t('settings.advancedSettings.usbPage.gamepadHint', 'Adds a USB game pad to the composite gadget so a local controller can be forwarded through the browser. Saving this option re-enumerates USB on the controlled host.') }}</small>
          </div>
          <n-switch v-model:value="usb.gamepad" :disabled="props.disabled || gamepadBlocked" />
        </li>
        <li v-if="showMassStorage">
          <div>
            <strong>{{ t('settings.advancedSettings.usbPage.storage', 'Virtual storage') }}</strong>
            <small>{{ storageBlocked ? t('settings.advancedSettings.usbPage.storageBlocked', 'Virtual storage needs one more IN and OUT endpoint than this controller has free.') : t('settings.advancedSettings.usbPage.storageHint', 'ISO and virtual USB drive. Off removes the mass-storage function from the gadget.') }}</small>
          </div>
          <n-switch v-model:value="massStorageOn" :disabled="props.disabled || storageBlocked" />
        </li>
        <li v-if="showMTP">
          <div>
            <strong>{{ t('virtualMedia.mtpTab', 'MTP') }}</strong>
            <small>{{ mtpBlocked ? t('settings.advancedSettings.usbPage.mtpBlocked', 'MTP needs more endpoints than this controller has free.') : t('settings.advancedSettings.usbPage.mtpHint', 'Share the virtual-media folder over MTP. Off removes the MTP function from the gadget.') }}</small>
          </div>
          <n-switch v-model:value="mtpOn" :disabled="props.disabled || mtpBlocked" />
        </li>
      </ul>
    </section>

    <AudioSettingsForm
      v-if="audio.enabled"
      v-model="audio"
      :show-enable="false"
      :disabled="props.disabled || audioBlocked"
      @validity="audioValid = $event"
    />

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
          <n-input-number :value="usb.keyboard_interval ?? 0" :disabled="props.disabled" :min="0" :max="255" :show-button="false" @update:value="setInterval('keyboard_interval', $event)" />
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
          <n-input-number :value="usb.mouse_interval ?? 0" :disabled="props.disabled" :min="0" :max="255" :show-button="false" @update:value="setInterval('mouse_interval', $event)" />
        </n-form-item>
      </n-form>
    </section>

    <section v-if="massStorageOn" class="usb-settings-card">
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
</style>
