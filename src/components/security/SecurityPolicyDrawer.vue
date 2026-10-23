<script setup lang="ts">
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { Save } from '@/icons'

const show = defineModel<boolean>('show', { required: true })
defineProps<{ title: string; saving: boolean; dirty: boolean; valid: boolean; canManage: boolean; error: string }>()
const emit = defineEmits<{ save: [] }>()
const overlayTo = useOverlayMount()
</script>

<template>
  <n-drawer v-model:show="show" :to="overlayTo" width="min(520px, 100vw)" placement="right"
    :mask-closable="!saving" :close-on-esc="!saving" class="security-policy-drawer">
    <n-drawer-content :title="title" :closable="!saving">
      <n-alert v-if="error" type="error" :bordered="false" class="security-policy-error">{{ error }}</n-alert>
      <slot />
      <template #footer>
        <div class="security-policy-actions">
          <n-button :disabled="saving" @click="show = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button v-if="canManage" type="primary" :loading="saving" :disabled="!dirty || !valid" @click="emit('save')">
            <template #icon><Save aria-hidden="true" /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.security-policy-error { margin-bottom: 20px; }
.security-policy-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
