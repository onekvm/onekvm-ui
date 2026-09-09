import type { Component, DeepReadonly } from 'vue'

import type { AuthStatus, AuthUser, AuthUserUpdate } from '@/api/client'

export type ProductAuthStatus = DeepReadonly<AuthStatus>

export interface ProductUserAssignment {
  label: string
  value: string
}

export interface ProductUserAssignments {
  enabled: (auth: ProductAuthStatus) => boolean
  fieldLabel?: () => string
  load: () => Promise<ProductUserAssignment[]>
  value: (user: AuthUser) => string | undefined
  label: (user: AuthUser, assignments: readonly ProductUserAssignment[]) => string | undefined
  apply: (user: AuthUserUpdate, assignment: string) => AuthUserUpdate
}

export interface ProductSettingsSection {
  key: string
  label: () => string
  icon: Component
  component: Component
  visible: (auth: ProductAuthStatus) => boolean
}

export interface UIProduct {
  badge: (auth: ProductAuthStatus) => string
  userAssignments?: ProductUserAssignments
  settingsSections?: readonly ProductSettingsSection[]
}
