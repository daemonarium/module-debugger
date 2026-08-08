<template>
  <div data-testid="message-stream" class="message-stream flex flex-col gap-2 min-h-0">
    <div class="flex items-center gap-2 flex-wrap">
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
      <span data-testid="message-count" class="text-xs text-gray-500">
        {{ filtered.length }} / {{ messages.length }} messages
      </span>
    </div>
    <div class="border border-gray-200 rounded overflow-auto max-h-80">
      <table class="w-full text-xs font-mono">
        <thead class="bg-gray-50 sticky top-0">
          <tr class="text-left">
            <th class="p-1 w-10">#</th>
            <th class="p-1 w-14">dir</th>
            <th class="p-1 w-12">sock</th>
            <th class="p-1">type</th>
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
            class="cursor-pointer border-t border-gray-100 hover:bg-blue-50"
            :class="{ 'bg-blue-100': msg.id === selectedId }"
            @click="$emit('select', msg.id)"
          >
            <td class="p-1">{{ msg.id }}</td>
            <td class="p-1">
              <Tag
                data-testid="message-dir"
                :value="msg.direction.toUpperCase()"
                :severity="msg.direction === 'in' ? 'info' : 'success'"
                class="text-[10px]"
              />
            </td>
            <td class="p-1">{{ msg.socket }}</td>
            <td class="p-1 truncate max-w-[14rem]" :title="typeLabel(msg)">
              {{ typeLabel(msg) }}
            </td>
            <td class="p-1">{{ msg.bytes.length }}</td>
            <td class="p-1">{{ eventsLabel(msg) }}</td>
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
  import type { StreamMessage } from '../../replay/browser'

  const props = defineProps<{
    messages: StreamMessage[]
    selectedId: number | null
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

  function typeLabel(msg: StreamMessage): string {
    if (msg.incomplete) return '(incomplete)'
    if (msg.typeName) return msg.typeName
    if (msg.decodeError) return '(decode error)'
    return '(unknown)'
  }

  function eventsLabel(msg: StreamMessage): string {
    const idx = msg.frameIndices
    if (idx.length === 0) return '—'
    if (idx.length === 1) return String(idx[0])
    return `${idx[0]}–${idx[idx.length - 1]}`
  }
</script>
