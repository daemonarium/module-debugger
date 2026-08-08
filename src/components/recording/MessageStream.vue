<template>
  <div data-testid="message-stream" class="message-stream flex flex-col gap-2 h-full min-h-0">
    <div class="flex items-center gap-2 flex-wrap shrink-0">
      <label class="text-sm font-medium">Socket</label>
      <div data-testid="message-socket-filter">
        <Select
          v-model="socketFilter"
          :options="socketOptions"
          option-label="label"
          option-value="value"
          class="w-40"
          size="small"
        />
      </div>
      <span data-testid="message-count" class="text-xs text-surface-500">
        {{ filtered.length }} / {{ messages.length }} messages
      </span>
    </div>
    <div class="border border-surface-200 dark:border-surface-700 rounded overflow-auto flex-1 min-h-0">
      <table class="w-full text-xs font-mono border-collapse">
        <thead class="bg-surface-50 dark:bg-surface-800 sticky top-0 z-10 shadow-[0_1px_0_0_var(--p-surface-200)] dark:shadow-[0_1px_0_0_var(--p-surface-700)]">
          <tr class="text-left text-surface-600 dark:text-surface-400">
            <th class="p-1 w-10">#</th>
            <th class="p-1 w-14">dir</th>
            <th class="p-1 w-12">sock</th>
            <th class="p-1 w-16">req</th>
            <th class="p-1">summary</th>
            <th class="p-1 w-14">bytes</th>
            <th class="p-1 w-20">events</th>
            <th class="p-1 w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="msg in filtered"
            :key="msg.id"
            data-testid="message-row"
            :data-message-id="msg.id"
            :data-message-dir="msg.direction"
            :data-request-id="msg.rpc?.requestId"
            :data-message-current="msg.id === currentId ? '1' : undefined"
            class="cursor-pointer border-t border-surface-100 dark:border-surface-800 hover:bg-primary-50 dark:hover:bg-primary-900/20"
            :class="[
              {
                'bg-primary-100 dark:bg-primary-900/40': msg.id === selectedId,
                'ring-1 ring-inset ring-amber-400': msg.id === currentId && msg.id !== selectedId,
              },
              getRowColorClass(msg)
            ]"
            @click="$emit('select', msg.id)"
          >
            <td class="p-1 text-surface-500">{{ msg.id }}</td>
            <td class="p-1">
              <Tag
                data-testid="message-dir"
                :value="msg.direction.toUpperCase()"
                :severity="msg.direction === 'in' ? 'info' : 'success'"
                class="text-[10px]"
              />
            </td>
            <td class="p-1">
              <button
                type="button"
                data-testid="message-socket-link"
                class="text-primary-600 dark:text-primary-400 hover:underline"
                @click.stop="$emit('navigate-socket', msg.socket)"
              >{{ msg.socket }}</button>
            </td>
            <td class="p-1">
              <span
                v-if="msg.rpc?.requestId"
                class="inline-block px-1 rounded text-[10px] border"
                :class="getReqIdStyle(msg)"
              >
                {{ msg.rpc.requestId }}
              </span>
            </td>
            <td class="p-1 truncate max-w-[20rem]" :title="summaryTitle(msg)">
              <template v-if="msg.rpc?.kind === 'request'">
                <MethodSignatureView
                  mode="request"
                  :method-name="msg.rpc.methodName"
                  :owner-type-name="msg.rpc.ownerTypeName"
                  :param-types="msg.rpc.paramTypes"
                  :return-type="msg.rpc.returnType"
                  :return-type-name="msg.rpc.returnTypeName"
                  :show-types="showTypes"
                  :show-param-values="showParamValues"
                  :args="msg.rpc.args"
                  :show-result="showResults && !showResponses"
                  :result-value="pairedResult(msg)"
                  clickable-method
                  @click-method="onMethodClick(msg)"
                />
              </template>
              <template v-else-if="msg.rpc?.kind === 'response'">
                <MethodSignatureView
                  mode="response"
                  :method-name="msg.rpc.methodName"
                  :return-type="msg.rpc.returnType"
                  :return-type-name="msg.rpc.returnTypeName"
                  :show-types="showTypes"
                  :show-result="showResults"
                  :result-value="msg.rpc.returnValue"
                />
              </template>
              <template v-else-if="msg.rpc?.kind === 'error'">
                <span class="text-red-600 dark:text-red-400 font-semibold mr-1">error</span>
                <span v-if="msg.rpc.exception?.typeName">{{ msg.rpc.exception.typeName }}</span>
              </template>
              <template v-else>
                {{ typeLabel(msg) }}
              </template>
            </td>
            <td class="p-1 text-surface-500">{{ msg.bytes.length }}</td>
            <td class="p-1 text-surface-500">{{ eventsLabel(msg) }}</td>
            <td class="p-1">
              <div class="flex items-center gap-0.5">
                <Button
                  data-testid="message-jump"
                  icon="pi pi-history"
                  size="small"
                  text
                  rounded
                  v-tooltip.top="'Show in Events'"
                  class="!w-7 !h-7"
                  :disabled="!msg.frameIndices.length"
                  @click.stop="$emit('jump', msg.frameIndices[0] ?? 0)"
                />
                <Button
                  data-testid="message-debug"
                  icon="pi pi-wrench"
                  size="small"
                  text
                  rounded
                  severity="warn"
                  v-tooltip.top="'Debug in browser (seek + debugger before waos_socket_data)'"
                  class="!w-7 !h-7"
                  :disabled="!canDebug(msg)"
                  @click.stop="$emit('debug', msg.id)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      data-testid="message-display-toggles"
      class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-surface-600 dark:text-surface-400 border-t border-surface-200 dark:border-surface-700 pt-2"
    >
      <label class="inline-flex items-center gap-2 cursor-pointer" data-testid="toggle-param-values">
        <ToggleSwitch v-model="showParamValues" />
        <span>Show parameter values</span>
      </label>
      <label class="inline-flex items-center gap-2 cursor-pointer" data-testid="toggle-results">
        <ToggleSwitch v-model="showResults" />
        <span>Show results</span>
      </label>
      <label class="inline-flex items-center gap-2 cursor-pointer" data-testid="toggle-types">
        <ToggleSwitch v-model="showTypes" />
        <span>Show types</span>
      </label>
      <label class="inline-flex items-center gap-2 cursor-pointer" data-testid="toggle-responses">
        <ToggleSwitch v-model="showResponses" />
        <span>Show responses</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import Tag from 'primevue/tag'
  import Select from 'primevue/select'
  import Button from 'primevue/button'
  import ToggleSwitch from 'primevue/toggleswitch'
  import type { EnrichedStreamMessage } from '../../replay/browser'
  import { findPairedMessage } from '../../replay/browser'
  import MethodSignatureView from './MethodSignatureView.vue'
  import { colorForRequestId } from './requestIdColor.js'
  import { shouldShowOwnerChip } from './ownerChip.js'

  const props = defineProps<{
    messages: EnrichedStreamMessage[]
    selectedId: number | null
    currentId?: number | null
  }>()

  const emit = defineEmits<{
    select: [id: number]
    jump: [frameIndex: number]
    debug: [id: number]
    'navigate-socket': [socket: number]
    'navigate-method': [payload: { socket: number; ownerTypeName?: string; methodName: string }]
    'update:displayMessages': [messages: EnrichedStreamMessage[]]
  }>()

  const socketFilter = ref<number | 'all'>('all')
  const showParamValues = ref(true)
  const showResults = ref(true)
  const showTypes = ref(true)
  const showResponses = ref(true)

  const socketOptions = computed(() => {
    const set = new Set<number>()
    for (const m of props.messages) set.add(m.socket)
    return [
      { label: 'All', value: 'all' as const },
      ...[...set].sort((a, b) => a - b).map((s) => ({ label: String(s), value: s })),
    ]
  })

  const filtered = computed(() => {
    let list = props.messages
    if (!showResponses.value) {
      list = list.filter((m) => m.rpc?.kind !== 'response')
    }
    if (socketFilter.value !== 'all') {
      list = list.filter((m) => m.socket === socketFilter.value)
    }
    return list
  })

  watch(
    filtered,
    (list) => {
      emit('update:displayMessages', list)
    },
    { immediate: true }
  )

  function typeLabel(msg: EnrichedStreamMessage): string {
    if (msg.incomplete) return '(incomplete)'
    if (msg.typeName) return msg.typeName
    if (msg.decodeError) return '(decode error)'
    return '(unknown)'
  }

  function eventsLabel(msg: EnrichedStreamMessage): string {
    const idx = msg.frameIndices
    if (idx.length === 0) return '—'
    if (idx.length === 1) return String(idx[0])
    return `${idx[0]}–${idx[idx.length - 1]}`
  }

  function getRowColorClass(msg: EnrichedStreamMessage) {
    const color = colorForRequestId(msg.rpc?.requestId)
    if (!color) return ''
    return `border-l-4 border-l-transparent hover:border-l-current ${color.bg.replace('100', '50').replace('900/30', '900/10')}`
  }

  function getReqIdStyle(msg: EnrichedStreamMessage) {
    const color = colorForRequestId(msg.rpc?.requestId)
    if (!color) return ''
    return `${color.bg} ${color.border} ${color.text}`
  }

  function pairedResult(msg: EnrichedStreamMessage): unknown {
    const paired = findPairedMessage(props.messages, msg)
    if (!paired?.rpc) return undefined
    if (paired.rpc.kind === 'response') return paired.rpc.returnValue
    if (paired.rpc.kind === 'error') return paired.rpc.exception?.value
    return undefined
  }

  function canDebug(msg: EnrichedStreamMessage): boolean {
    return msg.direction === 'in' && msg.frameIndices.length > 0 && !msg.incomplete
  }

  function onMethodClick(msg: EnrichedStreamMessage) {
    const name = msg.rpc?.methodName
    if (!name) return
    emit('navigate-method', {
      socket: msg.socket,
      ownerTypeName: msg.rpc?.ownerTypeName,
      methodName: name,
    })
  }

  function summaryTitle(msg: EnrichedStreamMessage): string {
    if (msg.rpc?.kind === 'request') {
      const method = msg.rpc.methodName || 'unknown'
      const owner =
        shouldShowOwnerChip(msg.rpc.ownerTypeName, msg.rpc.methodName) && msg.rpc.ownerTypeName
          ? `${msg.rpc.ownerTypeName} `
          : ''
      const params = (msg.rpc.paramTypes || []).map((p) => p.name).join(', ')
      return `${owner}${method}(${params})`
    }
    if (msg.rpc?.kind === 'response') {
      return `→ ${msg.rpc.returnTypeName || 'void'}`
    }
    return typeLabel(msg)
  }
</script>
