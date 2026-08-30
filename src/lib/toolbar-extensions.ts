export const TOOLBAR_SLOTS = ['device-controls', 'actions-start', 'actions-end'] as const
export type ToolbarSlot = (typeof TOOLBAR_SLOTS)[number]

export function isToolbarSlot(value: string): value is ToolbarSlot {
  return (TOOLBAR_SLOTS as readonly string[]).includes(value)
}

export function sortToolbarItems<T extends { extensionId: string; order: number }>(items: T[]) {
  return [...items].sort(
    (left, right) => left.order - right.order || left.extensionId.localeCompare(right.extensionId),
  )
}
