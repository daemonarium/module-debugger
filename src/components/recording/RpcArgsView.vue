<template>
  <div v-if="!rpc.args || rpc.args.length === 0" class="text-sm text-surface-500 italic">
    No arguments
  </div>
  <div v-else class="space-y-1">
    <ValueTreeViewer
      v-for="(arg, idx) in rpc.args"
      :key="idx"
      :name="arg.name"
      :value="arg.value"
      :type="arg.type"
      :registry="registry"
    />
  </div>
</template>

<script setup lang="ts">
  import ValueTreeViewer from '../ValueTreeViewer.vue'
  import type { RpcEnrichment } from '../../replay/browser'
  import type { TypeRegistry } from '@wa-os/ts-rpc'

  defineProps<{
    rpc: RpcEnrichment
    registry: TypeRegistry | null
  }>()
</script>
