<template>
  <div data-testid="message-detail" class="message-detail flex flex-col gap-3">
    <div v-if="!message" class="text-sm text-gray-500">Select a message in the stream.</div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <Tag
          :value="message.direction.toUpperCase()"
          :severity="message.direction === 'in' ? 'info' : 'success'"
        />
        <span class="font-mono text-sm">sock={{ message.socket }}</span>
        <span data-testid="message-type-name" class="font-mono text-sm">
          {{ message.typeName || (message.incomplete ? '(incomplete)' : '(undecoded)') }}
        </span>
        <Button
          data-testid="message-show-events"
          label="Show in Events"
          icon="pi pi-arrow-right"
          size="small"
          severity="secondary"
          :disabled="!message.frameIndices.length"
          @click="$emit('jump', message.frameIndices[0]!)"
        />
      </div>

      <div class="text-xs text-gray-600">
        Events:
        <span data-testid="message-frame-indices" class="font-mono">
          {{ message.frameIndices.join(', ') || '—' }}
        </span>
        <span v-if="message.registryKey" class="ml-2">
          Registry key: <span class="font-mono">{{ message.registryKey }}</span>
        </span>
      </div>

      <HexPane :data="message.bytes" />

      <Message
        v-if="message.decodeError"
        data-testid="message-decode-warn"
        severity="warn"
        :closable="false"
      >
        {{ message.decodeError }}
      </Message>

      <div v-if="message.header !== undefined" data-testid="message-decode-block" class="space-y-1">
        <div class="text-xs font-semibold text-gray-600">Decoded header</div>
        <pre
          data-testid="message-decode-json"
          class="text-xs font-mono bg-gray-50 p-2 rounded overflow-auto max-h-48"
        >{{ headerJson }}</pre>
        <div v-if="message.payloadSize" class="text-xs text-gray-500">
          trailing payload: {{ message.payloadSize }} bytes
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import Tag from 'primevue/tag'
  import Button from 'primevue/button'
  import Message from 'primevue/message'
  import HexPane from './HexPane.vue'
  import type { StreamMessage } from '../../replay/browser'

  const props = defineProps<{
    message: StreamMessage | null
  }>()

  defineEmits<{
    jump: [frameIndex: number]
  }>()

  const headerJson = computed(() => {
    if (!props.message || props.message.header === undefined) return ''
    try {
      return JSON.stringify(
        props.message.header,
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
        2
      )
    } catch {
      return String(props.message.header)
    }
  })
</script>
