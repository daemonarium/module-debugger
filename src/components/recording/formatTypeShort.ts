import { TypeKind, type TypeDescription } from '@daemonarium/rpc'

export function formatTypeShort(type: TypeDescription | undefined | null): string {
  if (!type) return 'unknown'
  switch (type.kind) {
    case TypeKind.Array:
      return `vector<${formatTypeShort(type.item)}>`
    case TypeKind.Map:
      return `map<${formatTypeShort(type.key)}, ${formatTypeShort(type.item)}>`
    case TypeKind.Pointer:
      return `${formatTypeShort(type.item)}*`
    default:
      return type.name || 'unknown'
  }
}
