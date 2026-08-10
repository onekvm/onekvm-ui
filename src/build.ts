export function hasPermission(auth: { readonly permissions: readonly string[] }, permission: string) {
  return (auth.permissions || []).includes(permission)
}
