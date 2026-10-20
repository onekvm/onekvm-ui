const KEY = 'onekvm:diagnostics-job'

export function pendingDiagnostics(): string {
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}

export function savePendingDiagnostics(id: string) {
  try {
    if (id) sessionStorage.setItem(KEY, id)
    else sessionStorage.removeItem(KEY)
  } catch { /* Collection still works when browser storage is unavailable. */ }
}
