<template>
  <div data-testid="frame-detail" class="frame-detail flex flex-col gap-3 h-full min-h-0 overflow-auto">
    <div v-if="!frame" class="text-sm text-gray-500">Select a frame in the timeline.</div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <Tag data-testid="frame-class" :value="frame.class" />
        <span data-testid="frame-type-name" class="font-mono text-sm">{{ frame.typeName }}</span>
        <span class="text-xs text-gray-500">offset={{ frame.offset }}</span>
        <Button
          v-if="canDebug"
          data-testid="frame-debug"
          icon="pi pi-wrench"
          label="Debug"
          size="small"
          severity="warn"
          class="ml-auto"
          v-tooltip.top="'Seek before Data IN and break in browser debugger'"
          @click="$emit('debug')"
        />
      </div>
      <pre data-testid="frame-header-json" class="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">{{ headerJson }}</pre>

      <Message v-if="replayError" severity="error" :closable="false">
        {{ replayError }}
      </Message>

      <HexPane :data="frame.payload" />

      <div data-testid="registry-key" class="text-xs text-gray-600">
        Registry key: <span class="font-mono">{{ registryKeyLabel }}</span>
        <span v-if="!hasRegistry"> (missing / empty)</span>
      </div>

      <Message
        v-if="decodeError"
        data-testid="decode-warn"
        severity="warn"
        :closable="false"
      >
        {{ decodeError }}
      </Message>

      <div v-if="decodedMessages.length" data-testid="decode-block" class="space-y-2">
        <div class="text-xs font-semibold text-gray-600">Decoded messages</div>
        <div
          v-for="(msg, i) in decodedMessages"
          :key="i"
          class="border border-gray-200 rounded p-2"
        >
          <Tag data-testid="decode-msg-type" :value="msg.typeName" severity="info" class="mb-1" />
          <pre data-testid="decode-msg-json" class="text-xs font-mono overflow-auto max-h-40">{{ formatJson(msg.header) }}</pre>
          <div v-if="msg.payloadSize" class="text-xs text-gray-500">
            trailing payload: {{ msg.payloadSize }} bytes
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import Tag from 'primevue/tag'
  import Message from 'primevue/message'
  import Button from 'primevue/button'
  import HexPane from './HexPane.vue'
  import type { DecodedFrame, TopologyBinding } from '../../replay/browser'
  import {
    num,
    resolveRegistryBytes,
    decodeSocketPayloadWithRegistryBytes,
  } from '../../replay/browser'

  const props = defineProps<{
    frame: DecodedFrame | null
    processId: number
    topology: Map<number, TopologyBinding>
    registries: Map<string, Uint8Array>
    replayError?: string
  }>()

  defineEmits<{
    debug: []
  }>()

  function formatJson(value: unknown): string {
    try {
      return JSON.stringify(
        value,
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
        2
      )
    } catch {
      return String(value)
    }
  }

  const headerJson = computed(() => (props.frame ? formatJson(props.frame.header) : ''))

  const socket = computed(() => {
    if (!props.frame || !('socket' in props.frame.header)) return 0
    return num(props.frame.header.socket)
  })

  const canDebug = computed(() => {
    const f = props.frame
    if (!f || f.class !== 'stimulus') return false
    return (
      f.typeName === 'process_copy_event' ||
      f.typeName === 'process_data_event' ||
      f.typeName === 'process_drain_event'
    )
  })

  const resolved = computed(() =>
    resolveRegistryBytes(
      socket.value,
      props.processId,
      props.topology,
      props.registries
    )
  )

  const registryKeyLabel = computed(() => resolved.value.key)
  const hasRegistry = computed(
    () => !!(resolved.value.bytes && resolved.value.bytes.length > 0)
  )

  const decodeResult = computed(() => {
    if (!props.frame || !props.frame.payload.length) {
      return { ok: false, messages: [], error: props.frame ? 'empty payload' : undefined }
    }
    if (!hasRegistry.value) {
      return { ok: false, messages: [], error: 'no registry for this socket — hex only' }
    }
    return decodeSocketPayloadWithRegistryBytes(
      props.frame.payload,
      resolved.value.bytes!
    )
  })

  const decodedMessages = computed(() => decodeResult.value.messages)
  const decodeError = computed(() =>
    decodeResult.value.ok ? undefined : decodeResult.value.error
  )
</script>
