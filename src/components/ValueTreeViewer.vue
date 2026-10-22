<script setup lang="ts">
import { computed, inject, provide } from 'vue'
import { TypeKind, type TypeDescription, type TypeRegistry } from '@daemonarium/rpc'

const props = withDefaults(
  defineProps<{
    value: unknown
    type?: TypeDescription | null
    registry?: TypeRegistry | null
    name?: string
    depth?: number
    path?: string
    defaultExpandedDepth?: number
  }>(),
  {
    type: null,
    registry: null,
    name: '',
    depth: 0,
    path: 'root',
    defaultExpandedDepth: 2,
  }
)

const expandedPaths = inject<Set<string>>('valueTreeExpanded', new Set<string>())
if (props.depth === 0) {
  provide('valueTreeExpanded', expandedPaths)
}

const isExpanded = computed(() => {
  if (expandedPaths.has(props.path)) return true
  if (props.depth < props.defaultExpandedDepth) return true
  return false
})

function toggleExpand() {
  if (isExpanded.value) {
    expandedPaths.delete(props.path)
  } else {
    expandedPaths.add(props.path)
  }
}

const resolvedType = computed<TypeDescription | null>(() => {
  if (props.type) return props.type
  if (props.value && typeof props.value === 'object' && '_type' in props.value && props.registry) {
    const t = props.registry.getTypeByName((props.value as any)._type)
    if (t) return t
  }
  return null
})

const isComplex = computed(() => {
  if (props.value === null || props.value === undefined) return false
  if (props.value instanceof Uint8Array) return props.value.length > 8
  const kind = resolvedType.value?.kind
  if (
    kind === TypeKind.Array ||
    kind === TypeKind.Map ||
    kind === TypeKind.Object ||
    kind === TypeKind.Message ||
    kind === TypeKind.Exception ||
    kind === TypeKind.DynamicObject
  ) {
    return true
  }
  if (Array.isArray(props.value) || typeof props.value === 'object') return true
  return false
})

const isBinary = computed(() => props.value instanceof Uint8Array)
const isBigInt = computed(() => typeof props.value === 'bigint')

const typeLabel = computed(() => {
  if (resolvedType.value?.name) return resolvedType.value.name
  if (isBinary.value) return 'Uint8Array'
  if (props.value === null) return 'null'
  if (props.value === undefined) return 'undefined'
  if (Array.isArray(props.value)) return 'Array'
  return typeof props.value
})

const primitivePreview = computed(() => {
  if (props.value === null) return 'null'
  if (props.value === undefined) return 'undefined'
  if (isBigInt.value) return `${props.value}n`
  if (isBinary.value) {
    const u8 = props.value as Uint8Array
    const hex = Array.from(u8.subarray(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
    return u8.length > 8 ? `[${u8.length} bytes] ${hex}...` : `[${u8.length} bytes] ${hex}`
  }
  if (resolvedType.value?.kind === TypeKind.Enum && resolvedType.value.enumMembers) {
    const val = Number(props.value)
    const member = resolvedType.value.enumMembers.find((m) => m.value === val)
    return member ? `${member.name} (${val})` : String(val)
  }
  if (typeof props.value === 'object') {
    if (Array.isArray(props.value)) return `Array(${props.value.length})`
    const keys = Object.keys(props.value).filter((k) => k !== '_type')
    return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''} }`
  }
  if (typeof props.value === 'string') return `"${props.value}"`
  return String(props.value)
})

const showValue = computed(() => !isComplex.value || !isExpanded.value)

const children = computed(() => {
  if (!isComplex.value) return []
  if (isBinary.value) {
    const u8 = props.value as Uint8Array
    return Array.from(u8).map((b, i) => ({
      name: `[${i}]`,
      value: b,
      type: null as TypeDescription | null,
      path: `${props.path}.${i}`,
    }))
  }

  if (Array.isArray(props.value)) {
    const itemType = resolvedType.value?.item ?? null
    return props.value.map((v, i) => ({
      name: `[${i}]`,
      value: v,
      type: itemType,
      path: `${props.path}.${i}`,
    }))
  }

  if (props.value && typeof props.value === 'object') {
    const obj = props.value as Record<string, any>
    const members = resolvedType.value?.members
    if (members && members.length > 0) {
      return members.map((m) => ({
        name: m.name,
        value: obj[m.name],
        type: m.type,
        path: `${props.path}.${m.name}`,
      }))
    }
    return Object.keys(obj)
      .filter((k) => k !== '_type')
      .map((k) => ({
        name: k,
        value: obj[k],
        type: null as TypeDescription | null,
        path: `${props.path}.${k}`,
      }))
  }
  return []
})
</script>

<template>
  <div class="font-mono text-sm leading-snug" data-testid="value-tree">
    <div
      class="flex items-start py-0.5 hover:bg-surface-100 dark:hover:bg-surface-800 rounded -ml-1 pl-1 pr-1 group"
      :class="{ 'cursor-pointer select-none': isComplex }"
      @click="isComplex && toggleExpand()"
      data-testid="value-tree-node"
    >
      <div class="w-4 h-4 flex-shrink-0 flex items-center justify-center text-surface-400 mr-0.5">
        <svg
          v-if="isComplex"
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': isExpanded }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <!-- name : type = value -->
      <div class="flex flex-wrap items-baseline gap-x-1 flex-1 min-w-0">
        <span
          v-if="name"
          class="font-semibold text-surface-800 dark:text-surface-200 shrink-0"
        >{{ name }}</span>
        <span v-if="name" class="text-surface-400 shrink-0">:</span>
        <span
          class="text-surface-500 dark:text-surface-400 shrink-0"
          data-testid="value-tree-type"
        >{{ typeLabel }}</span>
        <template v-if="showValue">
          <span class="text-surface-400 shrink-0">=</span>
          <span class="text-primary-600 dark:text-primary-400 break-all min-w-0">
            {{ primitivePreview }}
          </span>
        </template>
      </div>
    </div>

    <div
      v-if="isComplex && isExpanded"
      class="ml-4 border-l border-surface-200 dark:border-surface-700 pl-1"
    >
      <ValueTreeViewer
        v-for="child in children"
        :key="child.path"
        :name="child.name"
        :value="child.value"
        :type="child.type"
        :registry="registry"
        :depth="depth + 1"
        :path="child.path"
        :default-expanded-depth="defaultExpandedDepth"
      />
    </div>
  </div>
</template>
