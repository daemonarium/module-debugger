<template>
  <div
    ref="rootEl"
    data-testid="environment-view"
    class="environment-view flex flex-col gap-3 h-full min-h-0 pt-2 overflow-auto"
  >
    <div v-if="bindings.length === 0" data-testid="environment-empty" class="text-sm text-surface-500">
      No bindings
    </div>

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="row in bindings"
        :key="row.socket"
        data-testid="environment-binding"
        :data-local-socket="row.socket"
        :data-expanded="expandedBindings.has(row.socket) ? '1' : undefined"
        class="border border-surface-200 dark:border-surface-700 rounded overflow-hidden"
        :class="{
          'ring-2 ring-primary-400': focusSocket === row.socket && highlightSocket,
        }"
      >
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-sm hover:bg-surface-50 dark:hover:bg-surface-800"
          @click="toggleBinding(row.socket)"
        >
          <i
            class="text-xs text-surface-400"
            :class="expandedBindings.has(row.socket) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
          />
          <span>local={{ row.socket }}</span>
          <span class="text-surface-400">↔</span>
          <span>peer pid={{ row.peerProcess }} sock={{ row.peerSocket }}</span>
          <span
            class="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-800"
          >{{ directionLabel(row.direction) }}</span>
        </button>

        <div
          v-if="expandedBindings.has(row.socket)"
          class="border-t border-surface-200 dark:border-surface-700 p-3 space-y-4 bg-surface-50 dark:bg-surface-900"
        >
          <div data-testid="environment-registry" :data-registry-role="'local'">
            <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Local registry
            </div>
            <RegistryTypeBrowser
              :registry-key="localKey(row)"
              :registry-bytes="registries.get(localKey(row)) ?? null"
              :focus-method="focusSocket === row.socket ? focusMethod : null"
              :focus-nonce="focusNonce"
            />
          </div>
          <div data-testid="environment-registry" :data-registry-role="'peer'">
            <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Peer registry
            </div>
            <RegistryTypeBrowser
              :registry-key="peerKey(row)"
              :registry-bytes="registries.get(peerKey(row)) ?? null"
              :focus-method="focusSocket === row.socket ? focusMethod : null"
              :focus-nonce="focusNonce"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="unboundKeys.length > 0" class="mt-2">
      <h3 class="text-sm font-semibold m-0 mb-2">Other registries</h3>
      <div class="flex flex-col gap-2">
        <div
          v-for="key in unboundKeys"
          :key="key"
          data-testid="environment-unbound-registry"
          :data-registry-key="key"
          :data-expanded="expandedUnbound.has(key) ? '1' : undefined"
          class="border border-surface-200 dark:border-surface-700 rounded overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-sm hover:bg-surface-50 dark:hover:bg-surface-800"
            @click="toggleUnbound(key)"
          >
            <i
              class="text-xs text-surface-400"
              :class="expandedUnbound.has(key) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
            />
            <span>{{ key }}</span>
            <span class="text-surface-500">— {{ registries.get(key)?.length ?? 0 }} bytes</span>
            <span
              v-if="(registries.get(key)?.length ?? 0) === 0"
              class="text-amber-600"
            >(empty)</span>
          </button>
          <div
            v-if="expandedUnbound.has(key)"
            class="border-t border-surface-200 dark:border-surface-700 p-3 bg-surface-50 dark:bg-surface-900"
          >
            <RegistryTypeBrowser
              :registry-key="key"
              :registry-bytes="registries.get(key) ?? null"
              :focus-method="focusUnboundMethod(key)"
              :focus-nonce="focusNonce"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import type { TopologyBinding } from '../../replay/browser'
  import { registryKey } from '../../replay/browser'
  import RegistryTypeBrowser from './RegistryTypeBrowser.vue'

  export type FocusMethod = {
    ownerTypeName?: string
    methodName: string
  }

  const DIR_LABELS: Record<number, string> = {
    0: 'NONE',
    1: 'IN',
    2: 'OUT',
    3: 'BOTH',
  }

  const props = withDefaults(
    defineProps<{
      processId: number
      topology: Map<number, TopologyBinding>
      registries: Map<string, Uint8Array>
      focusSocket?: number | null
      focusMethod?: FocusMethod | null
      focusNonce?: number
    }>(),
    {
      focusSocket: null,
      focusMethod: null,
      focusNonce: 0,
    }
  )

  const rootEl = ref<HTMLElement | null>(null)
  const expandedBindings = reactive(new Set<number>())
  const expandedUnbound = reactive(new Set<string>())
  const highlightSocket = ref(false)

  const bindings = computed(() =>
    [...props.topology.entries()]
      .map(([socket, b]) => ({ socket, ...b }))
      .sort((a, b) => a.socket - b.socket)
  )

  function localKey(row: { socket: number }) {
    return registryKey(props.processId, row.socket)
  }

  function peerKey(row: { peerProcess: number; peerSocket: number }) {
    return registryKey(row.peerProcess, row.peerSocket)
  }

  const boundKeys = computed(() => {
    const keys = new Set<string>()
    for (const row of bindings.value) {
      keys.add(localKey(row))
      keys.add(peerKey(row))
    }
    return keys
  })

  const unboundKeys = computed(() =>
    [...props.registries.keys()]
      .filter((k) => !boundKeys.value.has(k))
      .sort((a, b) => a.localeCompare(b))
  )

  function directionLabel(dir: number): string {
    return DIR_LABELS[dir] ?? String(dir)
  }

  function toggleBinding(socket: number) {
    if (expandedBindings.has(socket)) expandedBindings.delete(socket)
    else expandedBindings.add(socket)
  }

  function toggleUnbound(key: string) {
    if (expandedUnbound.has(key)) expandedUnbound.delete(key)
    else expandedUnbound.add(key)
  }

  function focusUnboundMethod(key: string) {
    if (props.focusSocket === null || props.focusSocket === undefined) return null
    if (key !== registryKey(props.processId, props.focusSocket)) return null
    return props.focusMethod
  }

  watch(
    () => [props.focusSocket, props.focusNonce] as const,
    async ([socket]) => {
      if (socket === null || socket === undefined) return
      const hasBinding = bindings.value.some((b) => b.socket === socket)
      if (hasBinding) {
        expandedBindings.add(socket)
      } else {
        const key = registryKey(props.processId, socket)
        if (props.registries.has(key)) {
          expandedUnbound.add(key)
        }
      }
      highlightSocket.value = true
      await nextTick()
      let target: Element | null | undefined =
        rootEl.value?.querySelector(`[data-local-socket="${socket}"]`)
      if (!hasBinding) {
        const key = registryKey(props.processId, socket)
        target = rootEl.value?.querySelector(
          `[data-testid="environment-unbound-registry"][data-registry-key="${key}"]`
        )
      }
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      window.setTimeout(() => {
        highlightSocket.value = false
      }, 1600)
    },
    { immediate: true }
  )
</script>
