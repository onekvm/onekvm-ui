export const recoveryThemes = ['system', 'light', 'dark'] as const

export type RecoveryTheme = (typeof recoveryThemes)[number]

export const RECOVERY_THEME_KEY = 'onekvm-recovery-theme'

export function isRecoveryTheme(value: string): value is RecoveryTheme {
  return (recoveryThemes as readonly string[]).includes(value)
}

export function resolveRecoveryTheme(preference: RecoveryTheme, systemDark: boolean): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference
  return systemDark ? 'dark' : 'light'
}

export function readRecoveryTheme(stored: string | null): RecoveryTheme {
  if (stored && isRecoveryTheme(stored)) return stored
  return 'system'
}
