<template>
  <template v-if="rpc.kind === 'error'">
    <div class="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Exception</div>
    <ValueTreeViewer
      :name="rpc.exception?.typeName || 'exception'"
      :value="rpc.exception?.value"
      :registry="registry"
    />
  </template>
  <template v-else>
    <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Return Value</div>
    <div v-if="!payloadSize || payloadSize === 0" class="text-sm text-surface-500 italic">
      Void / Empty return
    </div>
    <ValueTreeViewer
      v-else
      name="return"
      :value="rpc.returnValue"
      :type="rpc.returnType"
      :registry="registry"
    />
  </template>
</template>

<script setup lang="ts">
  import ValueTreeViewer from '../ValueTreeViewer.vue'
  import type { RpcEnrichment } from '../../replay/browser'
  import type { TypeRegistry } from '@wa-os/ts-rpc'

  defineProps<{
    rpc: RpcEnrichment
    payloadSize?: number
    registry: TypeRegistry | null
  }>()
</script>
