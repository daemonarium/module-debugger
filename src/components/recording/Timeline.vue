<template>
  <div data-testid="timeline" class="timeline flex flex-col gap-2 min-h-0">
    <div class="flex items-center gap-2 flex-wrap">
      <label class="text-sm font-medium">Socket</label>
      <div data-testid="socket-filter">
        <Select
          v-model="socketFilter"
          :options="socketOptions"
          option-label="label"
          option-value="value"
          class="w-40"
          size="small"
        />
      </div>
      <span data-testid="timeline-count" class="text-xs text-gray-500">
        {{ filtered.length }} / {{ frames.length }} frames
      </span>
    </div>
    <div class="border border-gray-200 rounded overflow-auto max-h-80">
      <table class="w-full text-xs font-mono">
        <thead class="bg-gray-50 sticky top-0">
          <tr class="text-left">
            <th class="p-1 w-12">#</th>
            <th class="p-1 w-24">class</th>
            <th class="p-1">type</th>
            <th class="p-1 w-16">sock</th>
            <th class="p-1 w-16">len</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filtered"
            :key="row.index"
            data-testid="timeline-row"
            :data-frame-index="row.index"
            :data-frame-class="row.frame.class"
            class="cursor-pointer border-t border-gray-100 hover:bg-blue-50"
            :class="{
              'bg-blue-100': row.index === selectedIndex,
              'bg-amber-50': row.index === currentIndex && row.index !== selectedIndex,
            }"
            @click="$emit('select', row.index)"
          >
            <td class="p-1">{{ row.index }}</td>
            <td class="p-1">
              <Tag :value="row.frame.class" :severity="classSeverity(row.frame.class)" class="text-[10px]" />
            </td>
            <td
              data-testid="timeline-type"
              class="p-1 truncate max-w-[14rem]"
              :title="row.frame.typeName"
            >{{ row.frame.typeName }}</td>
            <td class="p-1">{{ socketOf(row.frame) }}</td>
            <td class="p-1">{{ row.frame.payload.length }}</td>
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
  import type { DecodedFrame, FrameClass } from '../../replay/browser'
  import { num } from '../../replay/browser'

  const props = defineProps<{
    frames: DecodedFrame[]
    currentIndex: number
    selectedIndex: number
  }>()

  defineEmits<{
    select: [index: number]
  }>()

  const socketFilter = ref<number | 'all'>('all')

  const socketOptions = computed(() => {
    const set = new Set<number>()
    for (const f of props.frames) {
      if ('socket' in f.header) set.add(num(f.header.socket))
    }
    return [
      { label: 'All', value: 'all' as const },
      ...[...set].sort((a, b) => a - b).map((s) => ({ label: String(s), value: s })),
    ]
  })

  const filtered = computed(() => {
    return props.frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => {
        if (socketFilter.value === 'all') return true
        return num(frame.header.socket) === socketFilter.value
      })
  })

  function socketOf(frame: DecodedFrame): string {
    if (!('socket' in frame.header)) return '—'
    return String(num(frame.header.socket))
  }

  function classSeverity(c: FrameClass): 'info' | 'success' | 'warn' | 'secondary' | 'contrast' | 'danger' {
    switch (c) {
      case 'stimulus':
        return 'info'
      case 'expect':
        return 'success'
      case 'topology':
        return 'warn'
      case 'anchor':
        return 'danger'
      default:
        return 'secondary'
    }
  }
</script>
