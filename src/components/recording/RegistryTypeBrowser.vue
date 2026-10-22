<template>
  <div
    ref="rootEl"
    data-testid="recording-api-browser"
    class="registry-type-browser flex flex-col gap-3 min-h-0 h-full"
  >
    <div v-if="registryKey" class="text-xs font-mono text-surface-500 shrink-0">
      {{ registryKey }}
      <span v-if="registryBytes"> — {{ registryBytes.length }} bytes</span>
      <span v-if="registryBytes && registryBytes.length === 0" class="text-amber-600 ml-1">(empty)</span>
    </div>

    <div v-if="loadError" class="text-sm text-red-600 shrink-0">{{ loadError }}</div>

    <div v-else-if="!registryBytes || registryBytes.length === 0" class="text-sm text-surface-500 shrink-0">
      Registry missing or empty.
    </div>

    <div v-else-if="!registry" class="text-sm text-surface-500 shrink-0">
      Failed to load registry.
    </div>

    <div v-else-if="objectTypesWithMethods.length === 0" class="text-sm text-surface-500 shrink-0">
      No object types with methods found in this registry.
    </div>

    <div v-else class="space-y-4 overflow-auto flex-1 min-h-0">
      <Card
        v-for="objectType in objectTypesWithMethods"
        :key="objectType.name"
        class="w-full"
        data-testid="api-object-card"
      >
        <template #title>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono text-lg">{{ objectType.name }}</span>
            <Tag
              :value="objectType.kind === TypeKind.DynamicObject ? 'dynamic' : 'object'"
              severity="info"
            />
            <Tag
              v-for="annotation in objectType.annotations || []"
              :key="annotation._type"
              :value="annotation._type.replace('_annotation', '')"
              severity="secondary"
            />
          </div>
        </template>
        <template #content>
          <div class="space-y-4">
            <div
              v-for="methodMember in getMethods(objectType)"
              :key="methodMember.name"
              class="border-l-2 border-primary-200 dark:border-primary-700 pl-4 transition-shadow"
              data-testid="api-method-row"
              :data-method-name="methodMember.name"
              :data-owner-type="objectType.name"
              :data-highlighted="isFocusedMethod(objectType.name, methodMember.name) ? '1' : undefined"
              :class="{
                'ring-2 ring-primary-400 rounded': isFocusedMethod(objectType.name, methodMember.name),
              }"
            >
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <MethodSignatureView
                  mode="request"
                  :method-name="methodMember.name"
                  :owner-type-name="objectType.name"
                  :param-types="(methodMember.type.members || []).map((m) => ({
                    name: m.name,
                    typeName: m.type.name,
                    type: m.type,
                  }))"
                  :return-type="methodMember.type.item"
                  :return-type-name="methodMember.type.item?.name || 'void'"
                  :registry="registry"
                />
                <Tag
                  v-if="methodMember.type.kind === TypeKind.Method"
                  value="method"
                  severity="primary"
                  class="text-[10px]"
                />
                <Tag
                  v-if="methodMember.type.kind === TypeKind.Function"
                  value="function"
                  severity="success"
                  class="text-[10px]"
                />
                <span
                  v-if="methodMember.type.methodId !== undefined"
                  class="text-xs font-mono text-surface-500"
                >
                  id={{ methodMember.type.methodId }}
                </span>
              </div>

              <div v-if="methodMember.type.members && methodMember.type.members.length > 0" class="mb-2">
                <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Parameters</div>
                <div class="space-y-2 ml-2">
                  <div
                    v-for="param in methodMember.type.members"
                    :key="param.name"
                    class="flex items-start gap-2"
                  >
                    <span class="font-mono text-sm font-semibold shrink-0">{{ param.name }}</span>
                    <span class="text-surface-400">:</span>
                    <TypeViewer
                      :type="param.type"
                      :registry="registry"
                      :expanded-types="expandedTypes"
                      @toggle-expand="handleToggleExpand"
                    />
                  </div>
                </div>
              </div>

              <div v-if="methodMember.type.item" class="mb-1">
                <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Returns</div>
                <TypeViewer
                  :type="methodMember.type.item"
                  :registry="registry"
                  :expanded-types="expandedTypes"
                  @toggle-expand="handleToggleExpand"
                  class="ml-2"
                />
              </div>
              <div v-else class="text-xs text-surface-500 font-mono ml-2">→ void</div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import Card from 'primevue/card'
  import Tag from 'primevue/tag'
  import TypeViewer from '../TypeViewer.vue'
  import MethodSignatureView from './MethodSignatureView.vue'
  import { TypeKind, type TypeDescription, type TypeMember, type TypeRegistry } from '@daemonarium/rpc'
  import { loadTypeRegistryFromBytes } from '../../replay/sessionFiles.js'

  const props = withDefaults(
    defineProps<{
      registryBytes: Uint8Array | null
      registryKey?: string
      focusMethod?: { ownerTypeName?: string; methodName: string } | null
      focusNonce?: number
    }>(),
    {
      focusMethod: null,
      focusNonce: 0,
    }
  )

  const rootEl = ref<HTMLElement | null>(null)
  const expandedTypes = ref<Set<string>>(new Set())
  const loadError = ref<string | null>(null)
  const activeHighlight = ref<{ owner?: string; method: string } | null>(null)

  const registry = computed<TypeRegistry | null>(() => {
    loadError.value = null
    const bytes = props.registryBytes
    if (!bytes || bytes.length === 0) return null
    try {
      const reg = loadTypeRegistryFromBytes(bytes)
      reg.assignMethodIds()
      return reg
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
      return null
    }
  })

  const objectTypesWithMethods = computed(() => {
    if (!registry.value) return []
    return registry.value.getTypes().filter((type) => {
      if (type.kind !== TypeKind.Object && type.kind !== TypeKind.DynamicObject) return false
      return type.members?.some(
        (m) => m.type.kind === TypeKind.Method || m.type.kind === TypeKind.Function
      )
    })
  })

  function getMethods(objectType: TypeDescription): TypeMember[] {
    if (!objectType.members) return []
    return objectType.members.filter(
      (m) => m.type.kind === TypeKind.Method || m.type.kind === TypeKind.Function
    )
  }

  function handleToggleExpand(typeName: string) {
    if (expandedTypes.value.has(typeName)) {
      expandedTypes.value.delete(typeName)
    } else {
      expandedTypes.value.add(typeName)
    }
  }

  function isFocusedMethod(owner: string, method: string): boolean {
    if (!activeHighlight.value) return false
    if (activeHighlight.value.method !== method) return false
    if (activeHighlight.value.owner && activeHighlight.value.owner !== owner) return false
    return true
  }

  watch(
    () => [props.focusMethod, props.focusNonce, registry.value] as const,
    async ([method]) => {
      if (!method?.methodName) return
      activeHighlight.value = {
        owner: method.ownerTypeName,
        method: method.methodName,
      }
      await nextTick()
      const sel = method.ownerTypeName
        ? `[data-testid="api-method-row"][data-method-name="${CSS.escape(method.methodName)}"][data-owner-type="${CSS.escape(method.ownerTypeName)}"]`
        : `[data-testid="api-method-row"][data-method-name="${CSS.escape(method.methodName)}"]`
      const el = (rootEl.value ?? document).querySelector(sel)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      window.setTimeout(() => {
        if (activeHighlight.value?.method === method.methodName) {
          activeHighlight.value = null
        }
      }, 1800)
    },
    { immediate: true }
  )
</script>
