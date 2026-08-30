<script setup lang="ts">
import { computed, watch } from 'vue'

import type { USBConfig } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const usb = defineModel<USBConfig>({ required: true })

const idValid = (value: string) => /^(?:0x)?[0-9a-f]{4}$/i.test(value.trim())
const usbStringValid = (value: string, allowEmpty = false) =>
  (allowEmpty && value === '') || (value.length > 0 && new TextEncoder().encode(value).length <= 126 && !/[\u0000-\u001f\u007f]/.test(value))
const scsiStringValid = (value: string, maximum: number) =>
  value.length > 0 && value.length <= maximum && /^[\x20-\x7e]+$/.test(value)

const valid = computed(() =>
  idValid(usb.value.vendor_id) &&
  idValid(usb.value.product_id) &&
  usbStringValid(usb.value.manufacturer) &&
  usbStringValid(usb.value.product) &&
  usbStringValid(usb.value.serial_number, true) &&
  usbStringValid(usb.value.configuration) &&
  scsiStringValid(usb.value.storage_vendor, 8) &&
  scsiStringValid(usb.value.iso_product, 16) &&
  scsiStringValid(usb.value.drive_product, 16),
)

if (usb.value.gamepad == null) usb.value.gamepad = false

watch(valid, (value) => emit('validity', value), { immediate: true })
</script>

<template>
  <div class="usb-settings">
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.usbPage.restartHint', 'USB identity changes take effect after OneKVM or the device is restarted. The controlled host will enumerate the USB device again.') }}
    </n-alert>

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
        <h2>{{ t('settings.advancedSettings.usbPage.gamepad', 'WebHID gamepad') }}</h2>
        <p>{{ t('settings.advancedSettings.usbPage.gamepadHint', 'Adds a USB game pad to the composite gadget so a local controller can be forwarded through the browser. Saving this option re-enumerates USB on the controlled host.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false">
        <n-form-item :label="t('settings.advancedSettings.usbPage.gamepadEnable', 'Enable USB gamepad')">
          <n-switch v-model:value="usb.gamepad" :disabled="props.disabled" />
        </n-form-item>
      </n-form>
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
.usb-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
</style>
