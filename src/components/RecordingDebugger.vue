<template>
  <div data-testid="recording-debugger" class="recording-debugger p-4 flex flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 data-testid="recording-title" class="text-xl font-bold m-0">{{ dump.session.name || 'Recording' }}</h2>
        <div data-testid="recording-meta" class="text-sm text-gray-600 font-mono mt-1">
          pid={{ dump.session.processId }}
          status={{ dump.session.status || '—' }}
          snap={{ dump.anchor.snapshotUid }}
          mana={{ dump.anchor.manaUsed }}/{{ dump.anchor.manaLimit }}
          code={{ dump.code.length }}b
          mem={{ dump.memory.length }}b
          events={{ dump.events.length }}b
        </div>
        <div class="text-sm mt-1">
          expect matches:
          <strong data-testid="expect-matches">{{ expectMatches }}</strong>
        </div>
      </div>
      <Button
        data-testid="close-dump"
        label="Close dump"
        icon="pi pi-times"
        severity="secondary"
        size="small"
        @click="$emit('close')"
      />
    </div>

    <Message v-if="lastError" data-testid="replay-error" severity="error" :closable="false">
      Replay error at index {{ runtime.state.index }}: {{ lastError }}
    </Message>

    <Scrubber
      :index="uiIndex"
      :total="runtime.frames.length"
      :busy="busy"
      @seek="onSeek"
      @step="onStep"
      @run="onRun"
      @reset="onReset"
    />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
      <Timeline
        :frames="runtime.frames"
        :current-index="runtime.state.index"
        :selected-index="selectedIndex"
        @select="onSelectFrame"
      />
      <FrameDetail
        :frame="selectedFrame"
        :process-id="dump.session.processId"
        :topology="topologySnapshot"
        :registries="registriesSnapshot"
        :replay-error="frameReplayError"
      />
    </div>

    <TopologyPanel :topology="topologySnapshot" :registries="registriesSnapshot" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import Button from 'primevue/button'
  import Message from 'primevue/message'
  import Scrubber from './recording/Scrubber.vue'
  import Timeline from './recording/Timeline.vue'
  import FrameDetail from './recording/FrameDetail.vue'
  import TopologyPanel from './recording/TopologyPanel.vue'
  import {
    installReplayDevtools,
    type RecordingDump,
    type ReplayRuntime,
    ReplayError,
  } from '../replay/browser'

  const props = defineProps<{
    runtime: ReplayRuntime
  }>()

  defineEmits<{
    close: []
  }>()

  const busy = ref(false)
  const selectedIndex = ref(0)
  const tick = ref(0)

  const dump = computed(() => props.runtime.dump)
  const uiIndex = computed(() => {
    tick.value
    return props.runtime.state.index
  })
  const expectMatches = computed(() => {
    tick.value
    return props.runtime.state.expectMatches
  })
  const lastError = computed(() => {
    tick.value
    return props.runtime.state.lastError?.message
  })
  const topologySnapshot = computed(() => {
    tick.value
    return new Map(props.runtime.state.topology)
  })
  const registriesSnapshot = computed(() => {
    tick.value
    return new Map(props.runtime.state.registries)
  })
  const selectedFrame = computed(() => {
    const frames = props.runtime.frames
    if (selectedIndex.value < 0 || selectedIndex.value >= frames.length) return null
    return frames[selectedIndex.value]
  })
  const frameReplayError = computed(() => {
    tick.value
    const err = props.runtime.state.lastError
    if (!err) return undefined
    // Error was thrown while applying the frame that is now at index-1
    const failedAt = props.runtime.state.index - 1
    if (selectedIndex.value === failedAt || selectedIndex.value === props.runtime.state.index) {
      return err.message
    }
    return undefined
  })

  function refresh() {
    tick.value += 1
  }

  onMounted(() => {
    installReplayDevtools(props.runtime, () => {
      selectedIndex.value = props.runtime.state.index
      refresh()
    })
    selectedIndex.value = props.runtime.state.index
  })

  onUnmounted(() => {
    installReplayDevtools(null)
  })

  async function onSeek(index: number) {
    busy.value = true
    try {
      await props.runtime.seek(index)
      selectedIndex.value = props.runtime.state.index
      refresh()
    } finally {
      busy.value = false
    }
  }

  async function onSelectFrame(index: number) {
    selectedIndex.value = index
    if (index !== props.runtime.state.index) {
      await onSeek(index)
    }
  }

  function onStep() {
    try {
      props.runtime.step()
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
    }
    selectedIndex.value = props.runtime.state.index
    refresh()
  }

  function onRun() {
    try {
      props.runtime.run()
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
    }
    selectedIndex.value = props.runtime.state.index
    refresh()
  }

  async function onReset() {
    await onSeek(0)
  }
</script>
