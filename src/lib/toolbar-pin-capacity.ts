export function toolbarPinCapacity(count: number, available: number, columns = 1, buttonSize = 30, gap = 4) {
  const rows = Math.max(0, Math.floor((available + gap) / (buttonSize + gap)))
  const slots = rows * columns
  // An overflow control occupies one slot only when the pins cannot all fit.
  return slots >= count ? count : Math.max(0, slots - 1)
}
