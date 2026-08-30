export const TOOLBAR_SLOTS = ['device-controls', 'actions-start', 'actions-end'] as const
export type ToolbarSlot = (typeof TOOLBAR_SLOTS)[number]

export function isToolbarSlot(value: string): value is ToolbarSlot {
  return (TOOLBAR_SLOTS as readonly string[]).includes(value)
}

export function assertToolbarRegistrationId(id: string, expected: string | null) {
  if (!expected) {
    throw new Error('Extension toolbar registration is only allowed while the host is loading that extension')
  }
  if (id !== expected) {
    throw new Error(`Extension toolbar ID ${id} does not match ${expected}`)
  }
}

export function sortToolbarItems<T extends { extensionId: string; order: number }>(items: T[]) {
  return [...items].sort(
    (left, right) => left.order - right.order || left.extensionId.localeCompare(right.extensionId),
  )
}
