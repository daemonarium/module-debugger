<template>
  <div data-testid="hex-pane" class="hex-pane">
    <div class="text-xs font-semibold text-gray-600 mb-1">
      Raw Binary ({{ data.length }} bytes){{ truncated ? ' — truncated preview' : '' }}:
    </div>
    <div
      data-testid="hex-preview"
      class="font-mono text-xs bg-gray-900 text-green-400 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all"
    >
      {{ preview || '(empty)' }}
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      data: Uint8Array
      maxBytes?: number
    }>(),
    { maxBytes: 512 }
  )

  const truncated = computed(() => props.data.length > props.maxBytes)

  const preview = computed(() => {
    const slice = props.data.subarray(0, props.maxBytes)
    return Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ')
  })
</script>
