<template>
  <div data-testid="topology-panel" class="topology-panel flex flex-col gap-3">
    <h3 class="text-sm font-semibold m-0">Topology</h3>
    <div v-if="bindings.length === 0" data-testid="topology-empty" class="text-xs text-gray-500">
      No bindings
    </div>
    <table
      v-else
      data-testid="topology-bindings"
      class="w-full text-xs font-mono border border-gray-200 rounded"
    >
      <thead class="bg-gray-50">
        <tr class="text-left">
          <th class="p-1">local</th>
          <th class="p-1">peer pid</th>
          <th class="p-1">peer sock</th>
          <th class="p-1">dir</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in bindings"
          :key="row.socket"
          data-testid="topology-binding-row"
          class="border-t border-gray-100"
        >
          <td class="p-1">{{ row.socket }}</td>
          <td class="p-1">{{ row.peerProcess }}</td>
          <td class="p-1">{{ row.peerSocket }}</td>
          <td class="p-1">{{ row.direction }}</td>
        </tr>
      </tbody>
    </table>

    <h3 class="text-sm font-semibold m-0">Registries</h3>
    <ul data-testid="topology-registries" class="text-xs font-mono list-disc ml-4 space-y-1">
      <li v-for="r in registryRows" :key="r.key" data-testid="registry-row">
        {{ r.key }} — {{ r.size }} bytes
        <span v-if="r.size === 0" class="text-amber-600">(empty)</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { TopologyBinding } from '../../replay/browser'

  const props = defineProps<{
    topology: Map<number, TopologyBinding>
    registries: Map<string, Uint8Array>
  }>()

  const bindings = computed(() =>
    [...props.topology.entries()]
      .map(([socket, b]) => ({ socket, ...b }))
      .sort((a, b) => a.socket - b.socket)
  )

  const registryRows = computed(() =>
    [...props.registries.entries()]
      .map(([key, bytes]) => ({ key, size: bytes.length }))
      .sort((a, b) => a.key.localeCompare(b.key))
  )
</script>
