<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, Trash2, UserRound } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, type AuthUser, type AuthUserUpdate } from '@/api/client'
import { t } from '@/i18n/runtime'
import { uiProduct, type ProductAuthStatus, type ProductUserAssignment } from '@/product'

const props = withDefaults(defineProps<{
  auth: ProductAuthStatus
  currentUsername: string
  layout?: 'compact' | 'list'
}>(), {
  layout: 'compact',
})

const dialog = useDialog()
const message = useMessage()
const users = ref<AuthUser[]>([])
const productAssignments = ref<ProductUserAssignment[]>([])
const loading = ref(false)
const saving = ref(false)
const editorOpen = ref(false)
const editingUsername = ref('')
const draft = reactive({ username: '', password: '', assignment: 'user' })
const listLayout = computed(() => props.layout === 'list')
const assignmentProvider = computed(() => {
  const provider = uiProduct.userAssignments
  return provider?.enabled(props.auth) ? provider : undefined
})

const assignmentOptions = computed(() => [
  { label: t('settings.account.roleAdministrator', 'Administrator'), value: 'admin' },
  { label: t('settings.account.roleUser', 'User'), value: 'user' },
  ...productAssignments.value,
])
const assignmentFieldLabel = computed(() =>
  assignmentProvider.value?.fieldLabel?.() || t('settings.account.assignment', 'Role'),
)
const passwordValid = computed(() =>
  Boolean(editingUsername.value && draft.password.length === 0) ||
  (draft.password.length >= 8 && draft.password.length <= 128),
)
const passwordError = computed(() => passwordValid.value
  ? ''
  : t('settings.account.passwordLength', 'Password must contain 8 to 128 characters'),
)
const valid = computed(() => draft.username.trim().length > 0 && passwordValid.value)

function assignment(user: AuthUser) {
  return assignmentProvider.value?.value(user) || user.role
}

function assignmentLabel(user: AuthUser) {
  const productLabel = assignmentProvider.value?.label(user, productAssignments.value)
  if (productLabel) return productLabel
  return user.role === 'admin'
    ? t('settings.account.roleAdministrator', 'Administrator')
    : t('settings.account.roleUser', 'User')
}

async function load() {
  loading.value = true
  try {
    const [loadedUsers, loadedAssignments] = await Promise.all([
      api.getAuthUsers(),
      assignmentProvider.value?.load() || Promise.resolve([]),
    ])
    users.value = loadedUsers
    productAssignments.value = loadedAssignments
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingUsername.value = ''
  Object.assign(draft, { username: '', password: '', assignment: 'user' })
  editorOpen.value = true
}

function openEdit(user: AuthUser) {
  editingUsername.value = user.username
  Object.assign(draft, { username: user.username, password: '', assignment: assignment(user) })
  editorOpen.value = true
}

function userPayload(): AuthUserUpdate {
  const user = {
    username: draft.username.trim(),
    password: draft.password || undefined,
    role: draft.assignment,
  }
  return assignmentProvider.value?.apply(user, draft.assignment) || user
}

async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    const payload = userPayload()
    if (editingUsername.value) await api.updateAuthUser(editingUsername.value, payload)
    else await api.createAuthUser({ ...payload, password: draft.password })
    editorOpen.value = false
    await load()
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function remove(user: AuthUser) {
  dialog.warning({
    title: t('settings.account.deleteUser', 'Delete user'),
    content: user.username,
    positiveText: t('common.delete', 'Delete'),
    negativeText: t('common.cancel', 'Cancel'),
    positiveButtonProps: { type: 'error' },
    onPositiveClick: async () => {
      try {
        await api.deleteAuthUser(user.username)
        await load()
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : String(reason))
      }
    },
  })
}

onMounted(load)
</script>

<template>
  <section class="account-management" :class="{ 'user-management-list-layout': listLayout }">
    <header class="account-management-heading">
      <strong v-if="!listLayout">{{ t('settings.account.users', 'Users') }}</strong>
      <span v-else>{{ users.length }} {{ t('settings.account.users', 'Users') }}</span>
      <n-button type="primary" size="small" @click="openCreate">
        <template #icon><Plus /></template>
        {{ t('settings.account.addUser', 'Add user') }}
      </n-button>
    </header>
    <n-spin :show="loading">
      <ul class="account-management-list">
        <li v-for="user in users" :key="user.username">
          <UserRound :size="18" />
          <div><strong>{{ user.username }}</strong><span>{{ assignmentLabel(user) }}</span></div>
          <n-button quaternary circle size="small" :aria-label="t('common.edit', 'Edit')" @click="openEdit(user)">
            <template #icon><Pencil /></template>
          </n-button>
          <n-button quaternary circle size="small" type="error" :disabled="user.username === currentUsername" :aria-label="t('common.delete', 'Delete')" @click="remove(user)">
            <template #icon><Trash2 /></template>
          </n-button>
        </li>
      </ul>
    </n-spin>

    <n-drawer
      v-if="listLayout"
      v-model:show="editorOpen"
      placement="right"
      width="min(420px, 100vw)"
    >
      <n-drawer-content
        closable
        :title="editingUsername ? t('settings.account.editUser', 'Edit user') : t('settings.account.addUser', 'Add user')"
      >
        <n-form class="user-editor-form" label-placement="top" :show-feedback="false">
          <n-form-item :label="t('auth.username', 'Username')">
            <n-input v-model:value="draft.username" :maxlength="64" autocomplete="off" />
          </n-form-item>
          <n-form-item :label="editingUsername ? t('settings.account.newPasswordOptional', 'New password (optional)') : t('auth.password', 'Password')">
            <div class="user-password-field">
              <n-input
                v-model:value="draft.password"
                type="password"
                show-password-on="click"
                autocomplete="new-password"
                :maxlength="128"
                :status="passwordError ? 'error' : undefined"
              />
              <small v-if="passwordError" class="user-editor-error">{{ passwordError }}</small>
            </div>
          </n-form-item>
          <n-form-item :label="assignmentFieldLabel">
            <n-select v-model:value="draft.assignment" :options="assignmentOptions" />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="user-editor-drawer-actions">
            <n-button @click="editorOpen = false">{{ t('common.cancel', 'Cancel') }}</n-button>
            <n-button type="primary" :loading="saving" :disabled="!valid" @click="save">{{ t('common.save', 'Save') }}</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-else v-model:show="editorOpen" preset="card" class="account-editor-modal" :title="editingUsername ? t('settings.account.editUser', 'Edit user') : t('settings.account.addUser', 'Add user')">
      <n-form class="user-editor-form" label-placement="top" :show-feedback="false">
        <n-form-item :label="t('auth.username', 'Username')">
          <n-input v-model:value="draft.username" :maxlength="64" autocomplete="off" />
        </n-form-item>
        <n-form-item :label="editingUsername ? t('settings.account.newPasswordOptional', 'New password (optional)') : t('auth.password', 'Password')">
          <div class="user-password-field">
            <n-input
              v-model:value="draft.password"
              type="password"
              show-password-on="click"
              autocomplete="new-password"
              :maxlength="128"
              :status="passwordError ? 'error' : undefined"
            />
            <small v-if="passwordError" class="user-editor-error">{{ passwordError }}</small>
          </div>
        </n-form-item>
        <n-form-item :label="assignmentFieldLabel">
          <n-select v-model:value="draft.assignment" :options="assignmentOptions" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-actions">
          <n-button @click="editorOpen = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button type="primary" :loading="saving" :disabled="!valid" @click="save">{{ t('common.save', 'Save') }}</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.user-management-list-layout {
  gap: 10px;
  padding-top: 0;
}

.user-management-list-layout .account-management-heading {
  min-height: 28px;
  color: #929ca5;
  font-size: 12px;
}

.user-management-list-layout .account-management-list {
  overflow: hidden;
  border: 1px solid #30363d;
  border-radius: 6px;
}

.user-management-list-layout .account-management-list li {
  min-height: 54px;
  padding: 7px 12px;
  border-bottom: 0;
  background: #15191e;
  grid-template-columns: 32px minmax(0, 1fr) 32px 32px;
}

.user-management-list-layout .account-management-list li + li {
  border-top: 1px solid #30363d;
}

.user-management-list-layout .account-management-list li:hover {
  background: #1b2026;
}

.user-editor-drawer-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 8px;
}

.user-editor-form {
  display: grid;
  gap: 14px;
}

.user-password-field {
  display: grid;
  width: 100%;
  gap: 5px;
}

.user-editor-error {
  color: #e88080;
  font-size: 11px;
  line-height: 1.4;
}

@media (max-width: 520px) {
  .user-management-list-layout .account-management-list li {
    padding-inline: 9px;
  }
}
</style>
