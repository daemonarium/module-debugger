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
        :disabled="busy || isAtEnd"
        @click="$emit('step')"
      />
      <Button
        data-testid="btn-run"
        label="Run"
        icon="pi pi-play"
        size="small"
        severity="success"
        :disabled="busy || isAtEnd"
        @click="$emit('run')"
      />
      <span data-testid="scrubber-index" class="text-sm font-mono text-gray-600">
        {{ index }} / {{ total }}
        <span v-if="unitLabel" class="text-gray-400"> {{ unitLabel }}</span>
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

  const props = withDefaults(
    defineProps<{
      index: number
      total: number
      busy: boolean
      unitLabel?: string
      /** When set, overrides default index >= total end check */
      atEnd?: boolean
      /** Slider max; defaults to total (events) or total-1 when messageMode */
      sliderMaxOverride?: number
    }>(),
    { unitLabel: '', atEnd: undefined, sliderMaxOverride: undefined }
  )

  const emit = defineEmits<{
    seek: [index: number]
    step: []
    run: []
    reset: []
  }>()

  const isAtEnd = computed(() => {
    if (props.atEnd !== undefined) return props.atEnd || props.total === 0
    return props.index >= props.total || props.total === 0
  })

  const sliderMax = computed(() => {
    if (props.sliderMaxOverride !== undefined) {
      return Math.max(props.sliderMaxOverride, 0)
    }
    return Math.max(props.total, 0)
  })

  function onChange(value: number | number[]) {
    const v = Array.isArray(value) ? value[0] : value
    if (v === undefined) return
    emit('seek', v)
  }
</script>
