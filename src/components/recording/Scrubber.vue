<template>
  <div data-testid="scrubber" class="scrubber flex flex-col gap-3">
    <div class="flex items-center gap-2 flex-wrap">
      <Button
        data-testid="btn-reset"
        label="Reset"
        icon="pi pi-replay"
        size="small"
        severity="secondary"
        :disabled="busy"
        @click="$emit('reset')"
      />
      <Button
        data-testid="btn-step"
        label="Step"
        icon="pi pi-step-forward"
        size="small"
        :disabled="busy || atEnd"
        @click="$emit('step')"
      />
      <Button
        data-testid="btn-run"
        label="Run"
        icon="pi pi-play"
        size="small"
        severity="success"
        :disabled="busy || atEnd"
        @click="$emit('run')"
      />
      <span data-testid="scrubber-index" class="text-sm font-mono text-gray-600">
        {{ index }} / {{ total }}
      </span>
      <i v-if="busy" data-testid="scrubber-busy" class="pi pi-spin pi-spinner text-gray-500" />
    </div>
    <Slider
      data-testid="scrubber-slider"
      :model-value="index"
      :min="0"
      :max="sliderMax"
      :disabled="busy || total === 0"
      class="w-full"
      @change="onChange"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import Button from 'primevue/button'
  import Slider from 'primevue/slider'

  const props = defineProps<{
    index: number
    total: number
    busy: boolean
  }>()

  const emit = defineEmits<{
    seek: [index: number]
    step: []
    run: []
    reset: []
  }>()

  const atEnd = computed(() => props.index >= props.total || props.total === 0)
  const sliderMax = computed(() => Math.max(props.total, 0))

  function onChange(value: number | number[]) {
    const v = Array.isArray(value) ? value[0] : value
    emit('seek', v)
  }
</script>
