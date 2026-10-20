import type { Component } from 'vue'

export const DEFAULT_ICON_SET_ID = 'outline'
export const WIN98_ICON_SET_ID = 'win98'

/** Shared rendering contract; a set can use SVG, images, or Vue components. */
export interface OneKVMIconProps {
  size?: number | string
  color?: string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

export interface OneKVMIconSetDefinition {
  id: string
  name: string
  extends?: string
  icons: Readonly<Record<string, Component>>
}

export interface OneKVMIconSetSummary {
  id: string
  name: string
}

export interface ResolvedOneKVMIconSet extends OneKVMIconSetSummary {
  icons: Readonly<Record<string, Component>>
}

export interface OneKVMIconRuntimeV1 {
  register: (definition: OneKVMIconSetDefinition) => OneKVMIconSetSummary
  current: () => OneKVMIconSetSummary
  list: () => OneKVMIconSetSummary[]
  get: (name: string) => Component | undefined
}
