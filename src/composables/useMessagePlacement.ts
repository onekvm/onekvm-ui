import { shallowReadonly, shallowRef } from 'vue'
import type { MessagePlacement } from '@/api/client'

export const messagePlacements: readonly MessagePlacement[] = [
  'top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right',
]

const placement = shallowRef<MessagePlacement>('bottom-right')

export function setMessagePlacement(value: unknown) {
  placement.value = messagePlacements.includes(value as MessagePlacement)
    ? value as MessagePlacement
    : 'bottom-right'
}

export function useMessagePlacement() {
  return shallowReadonly(placement)
}
