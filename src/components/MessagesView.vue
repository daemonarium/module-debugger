<template>
  <div class="messages-view">
    <div v-if="messages.length === 0" class="text-gray-500 text-center py-8">
      No messages yet
    </div>
    <div v-else class="space-y-4">
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="message-item"
      >
        <DataView
          :data="message.data"
          :type="message.type"
          :registry="registry"
          :kind="message.kind"
          :request-id="message.requestId"
          :success="message.success"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import DataView from './DataView.vue'
  import type { TypeRegistry } from '@wa-os/ts-rpc'
  import type { RpcMessage } from '@wa-os/ts-rpc'

  const props = defineProps<{
    messages: RpcMessage[]
    registry: TypeRegistry
  }>()
</script>

<style scoped>
.messages-view {
  padding: 1rem;
}

.message-item {
  margin-bottom: 1rem;
}
</style>

