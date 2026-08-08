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
        <button
          type="button"
          data-testid="message-detail-socket-link"
          class="font-mono text-sm text-primary-600 dark:text-primary-400 hover:underline"
          @click="$emit('navigate-socket', message.socket)"
        >sock={{ message.socket }}</button>

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

        <button
          v-if="message.rpc?.methodName"
          type="button"
          data-testid="message-detail-method-link"
          class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 hover:underline"
          @click="onMethodClick"
        >
          <span
            v-if="showOwnerChip"
            class="inline-block px-1 py-0.5 rounded text-[10px] leading-none font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700"
            data-testid="owner-type-chip"
          >{{ message.rpc.ownerTypeName }}</span>
          {{ message.rpc.methodName }}
        </button>

        <div class="ml-auto flex items-center gap-1">
          <Button
            data-testid="message-show-events"
            icon="pi pi-history"
            size="small"
            severity="secondary"
            rounded
            v-tooltip.top="'Show in Events'"
            :disabled="!message.frameIndices.length"
            @click="$emit('jump', message.frameIndices[0]!)"
          />
          <Button
            data-testid="message-detail-debug"
            icon="pi pi-wrench"
            size="small"
            severity="warn"
            rounded
            v-tooltip.top="'Debug in browser'"
            :disabled="!(message.direction === 'in' && message.frameIndices.length)"
            @click="$emit('debug', message.id)"
          />
        </div>
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
        class="flex-1 overflow-auto min-h-[10rem] border border-surface-200 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-900 p-3 shadow-sm space-y-4"
      >
        <template v-if="message.rpc.kind === 'request'">
          <div>
            <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Request Arguments</div>
            <RpcArgsView :rpc="message.rpc" :registry="typeRegistry" />
          </div>

          <div data-testid="paired-response-section" class="pt-3 border-t border-surface-200 dark:border-surface-700">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                Response to this request
              </div>
              <Button
                v-if="pairedMessage"
                data-testid="jump-to-response"
                label="Jump to response"
                icon="pi pi-arrow-down"
                size="small"
                text
                class="!p-0 !text-xs ml-auto"
                @click="$emit('select', pairedMessage.id)"
              />
            </div>
            <div v-if="!pairedMessage" class="text-sm text-surface-500 italic">
              No matching response
            </div>
            <RpcResultView
              v-else
              :rpc="pairedMessage.rpc!"
              :payload-size="pairedMessage.payloadSize"
              :registry="pairedTypeRegistry"
            />
          </div>
        </template>

        <template v-else-if="message.rpc.kind === 'response' || message.rpc.kind === 'error'">
          <div data-testid="paired-request-section">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <div class="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                Request for this response
              </div>
              <Button
                v-if="pairedMessage"
                data-testid="jump-to-request"
                label="Jump to request"
                icon="pi pi-arrow-up"
                size="small"
                text
                class="!p-0 !text-xs ml-auto"
                @click="$emit('select', pairedMessage.id)"
              />
            </div>
            <div v-if="!pairedMessage" class="text-sm text-surface-500 italic">
              No matching request
            </div>
            <RpcArgsView
              v-else
              :rpc="pairedMessage.rpc!"
              :registry="pairedTypeRegistry"
            />
          </div>

          <div class="pt-3 border-t border-surface-200 dark:border-surface-700">
            <RpcResultView
              :rpc="message.rpc"
              :payload-size="message.payloadSize"
              :registry="typeRegistry"
            />
          </div>
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
  import RpcArgsView from './RpcArgsView.vue'
  import RpcResultView from './RpcResultView.vue'
  import type { EnrichedStreamMessage } from '../../replay/browser'
  import { colorForRequestId } from './requestIdColor.js'
  import { shouldShowOwnerChip } from './ownerChip.js'
  import type { TypeRegistry } from '@wa-os/ts-rpc'
  import { loadTypeRegistryFromBytes } from '../../replay/sessionFiles.js'

  const props = defineProps<{
    message: EnrichedStreamMessage | null
    pairedMessage?: EnrichedStreamMessage | null
    registries: Map<string, Uint8Array>
  }>()

  const emit = defineEmits<{
    jump: [frameIndex: number]
    select: [messageId: number]
    debug: [messageId: number]
    'navigate-socket': [socket: number]
    'navigate-method': [payload: { socket: number; ownerTypeName?: string; methodName: string }]
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

  function onMethodClick() {
    const msg = props.message
    const name = msg?.rpc?.methodName
    if (!msg || !name) return
    emit('navigate-method', {
      socket: msg.socket,
      ownerTypeName: msg.rpc?.ownerTypeName,
      methodName: name,
    })
  }

  function loadRegistry(key: string | undefined): TypeRegistry | null {
    if (!key) return null
    const bytes = props.registries.get(key)
    if (!bytes) return null
    try {
      const reg = loadTypeRegistryFromBytes(bytes)
      reg.assignMethodIds()
      return reg
    } catch {
      return null
    }
  }

  const typeRegistry = computed(() => loadRegistry(props.message?.registryKey))
  const pairedTypeRegistry = computed(() => loadRegistry(props.pairedMessage?.registryKey))
</script>
