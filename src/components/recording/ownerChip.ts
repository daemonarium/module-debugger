/** Show owner chip only when methodName is not already prefixed with ownerTypeName. */
export function shouldShowOwnerChip(
  ownerTypeName: string | undefined | null,
  methodName: string | undefined | null
): boolean {
  if (!ownerTypeName) return false
  const method = methodName || ''
  if (!method) return true
  return !method.startsWith(ownerTypeName)
}
