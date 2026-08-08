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
            <th class="p-1 w-16"></th>
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
            <td class="p-1 text-surface-500">{{ msg.socket }}</td>
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
              <template v-if="msg.rpc?.kind === 'request' || msg.rpc?.kind === 'response'">
                <MethodSignatureView
                  :mode="msg.rpc.kind"
                  :method-name="msg.rpc.methodName"
                  :owner-type-name="msg.rpc.ownerTypeName"
                  :param-types="msg.rpc.paramTypes"
                  :return-type="msg.rpc.returnType"
                  :return-type-name="msg.rpc.returnTypeName"
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
              <Button
                data-testid="message-jump"
                label="Jump"
                size="small"
                text
                class="!p-0 !text-xs"
                @click.stop="$emit('jump', msg.frameIndices[0] ?? 0)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import Tag from 'primevue/tag'
  import Select from 'primevue/select'
  import Button from 'primevue/button'
  import type { EnrichedStreamMessage } from '../../replay/browser'
  import MethodSignatureView from './MethodSignatureView.vue'
  import { colorForRequestId } from './requestIdColor.js'
  import { shouldShowOwnerChip } from './ownerChip.js'

  const props = defineProps<{
    messages: EnrichedStreamMessage[]
    selectedId: number | null
    /** Message tied to current scrubber/event cursor (ring highlight). */
    currentId?: number | null
  }>()

  defineEmits<{
    select: [id: number]
    jump: [frameIndex: number]
  }>()

  const socketFilter = ref<number | 'all'>('all')

  const socketOptions = computed(() => {
    const set = new Set<number>()
    for (const m of props.messages) set.add(m.socket)
    return [
      { label: 'All', value: 'all' as const },
      ...[...set].sort((a, b) => a - b).map((s) => ({ label: String(s), value: s })),
    ]
  })

  const filtered = computed(() => {
    if (socketFilter.value === 'all') return props.messages
    return props.messages.filter((m) => m.socket === socketFilter.value)
  })

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
    // apply background subtly
    // e.g., using opacity or a lighter version
    // Actually the palette uses Tailwind classes directly
    return `border-l-4 border-l-transparent hover:border-l-current ${color.bg.replace('100', '50').replace('900/30', '900/10')}`
  }

  function getReqIdStyle(msg: EnrichedStreamMessage) {
    const color = colorForRequestId(msg.rpc?.requestId)
    if (!color) return ''
    return `${color.bg} ${color.border} ${color.text}`
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

