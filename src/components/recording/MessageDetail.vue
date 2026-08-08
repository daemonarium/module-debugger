<template>
  <div data-testid="message-detail" class="message-detail flex flex-col gap-3 h-full min-h-0 overflow-auto">
    <div v-if="!message" class="text-sm text-surface-500">Select a message in the stream.</div>
    <template v-else>
      <!-- Meta -->
      <div class="flex flex-wrap items-center gap-2">
        <Tag
          :value="message.direction.toUpperCase()"
          :severity="message.direction === 'in' ? 'info' : 'success'"
        />
        <span class="font-mono text-sm text-surface-600 dark:text-surface-400">sock={{ message.socket }}</span>

        <span
          v-if="message.rpc?.requestId"
          class="font-mono text-sm px-1.5 py-0.5 rounded border"
          :class="getReqIdStyle(message)"
        >
          req {{ message.rpc.requestId }}
        </span>

        <span data-testid="message-type-name" class="font-mono text-sm text-surface-700 dark:text-surface-300">
          {{ message.typeName || (message.incomplete ? '(incomplete)' : '(undecoded)') }}
        </span>

        <span
          v-if="message.rpc?.methodName"
          class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1"
        >
          <span
            v-if="showOwnerChip"
            class="inline-block px-1 py-0.5 rounded text-[10px] leading-none font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700"
            data-testid="owner-type-chip"
          >{{ message.rpc.ownerTypeName }}</span>
          {{ message.rpc.methodName }}
        </span>

        <Button
          data-testid="message-show-events"
          label="Jump to Events"
          icon="pi pi-arrow-right"
          size="small"
          severity="secondary"
          :disabled="!message.frameIndices.length"
          @click="$emit('jump', message.frameIndices[0]!)"
          class="ml-auto"
        />
      </div>

      <div class="text-xs text-surface-500">
        Events:
        <span data-testid="message-frame-indices" class="font-mono">
          {{ message.frameIndices.join(', ') || '—' }}
        </span>
      </div>

      <!-- RPC Panel -->
      <div
        v-if="message.rpc && message.rpc.kind !== 'other'"
        class="flex-1 overflow-auto min-h-[10rem] border border-surface-200 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-900 p-3 shadow-sm"
      >
        <template v-if="message.rpc.kind === 'request'">
          <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Request Arguments</div>
          <div v-if="!message.rpc.args || message.rpc.args.length === 0" class="text-sm text-surface-500 italic">
            No arguments
          </div>
          <div v-else class="space-y-1">
            <ValueTreeViewer
              v-for="(arg, idx) in message.rpc.args"
              :key="idx"
              :name="arg.name"
              :value="arg.value"
              :type="arg.type"
              :registry="typeRegistry"
            />
          </div>
        </template>

        <template v-else-if="message.rpc.kind === 'response'">
          <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Return Value</div>
          <div v-if="!message.payloadSize || message.payloadSize === 0" class="text-sm text-surface-500 italic">
            Void / Empty return
          </div>
          <ValueTreeViewer
            v-else
            name="return"
            :value="message.rpc.returnValue"
            :type="message.rpc.returnType"
            :registry="typeRegistry"
          />
        </template>

        <template v-else-if="message.rpc.kind === 'error'">
          <div class="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Exception</div>
          <ValueTreeViewer
            :name="message.rpc.exception?.typeName || 'exception'"
            :value="message.rpc.exception?.value"
            :registry="typeRegistry"
          />
        </template>
      </div>

      <Message
        v-if="message.rpc?.enrichError || message.decodeError"
        data-testid="message-decode-warn"
        severity="warn"
        :closable="false"
      >
        <div v-if="message.rpc?.enrichError">RPC Enrich: {{ message.rpc.enrichError }}</div>
        <div v-if="message.decodeError">Decode: {{ message.decodeError }}</div>
      </Message>

      <!-- Wire Header (Collapsible) -->
      <div v-if="message.header !== undefined" data-testid="message-decode-block">
        <div
          class="text-xs font-semibold text-surface-600 dark:text-surface-400 cursor-pointer flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100"
          @click="showWireHeader = !showWireHeader"
        >
          <i
            :class="showWireHeader ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
            style="font-size: 0.7rem"
          ></i>
          Wire Header
        </div>
        <div
          v-if="showWireHeader"
          data-testid="message-decode-json"
          class="mt-1 p-2 rounded overflow-auto max-h-48 border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800"
        >
          <ValueTreeViewer
            :name="message.typeName || 'header'"
            :value="message.header"
            :registry="typeRegistry"
          />
        </div>
      </div>

      <!-- Hex Pane -->
      <div class="mt-auto pt-2 border-t border-surface-200 dark:border-surface-700">
        <HexPane :data="message.bytes" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import Tag from 'primevue/tag'
  import Button from 'primevue/button'
  import Message from 'primevue/message'
  import HexPane from './HexPane.vue'
  import ValueTreeViewer from '../ValueTreeViewer.vue'
  import type { EnrichedStreamMessage } from '../../replay/browser'
  import { colorForRequestId } from './requestIdColor.js'
  import { shouldShowOwnerChip } from './ownerChip.js'
  import type { TypeRegistry } from '@wa-os/ts-rpc'
  import { loadTypeRegistryFromBytes } from '../../replay/sessionFiles.js'

  const props = defineProps<{
    message: EnrichedStreamMessage | null
    registries: Map<string, Uint8Array>
  }>()

  defineEmits<{
    jump: [frameIndex: number]
  }>()

  const showWireHeader = ref(false)

  const showOwnerChip = computed(() =>
    shouldShowOwnerChip(props.message?.rpc?.ownerTypeName, props.message?.rpc?.methodName)
  )

  watch(() => props.message?.id, () => {
    showWireHeader.value = false
  })

  function getReqIdStyle(msg: EnrichedStreamMessage) {
    const color = colorForRequestId(msg.rpc?.requestId)
    if (!color) return ''
    return `${color.bg} ${color.border} ${color.text}`
  }

  const typeRegistry = computed<TypeRegistry | null>(() => {
    if (!props.message?.registryKey) return null
    const bytes = props.registries.get(props.message.registryKey)
    if (!bytes) return null
    try {
      const reg = loadTypeRegistryFromBytes(bytes)
      reg.assignMethodIds()
      return reg
    } catch {
      return null
    }
  })
</script>
