<template>
  <div
    data-testid="recording-debugger"
    class="recording-debugger flex flex-col h-full min-h-0 overflow-hidden"
  >
    <!-- Dump header -->
    <div
      class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900"
    >
      <h2 data-testid="recording-title" class="text-base font-bold m-0">
        {{ dump.session.name || 'Recording' }}
      </h2>
      <div data-testid="recording-meta" class="text-xs text-surface-600 dark:text-surface-400 font-mono">
        pid={{ dump.session.processId }}
        status={{ dump.session.status || '—' }}
        snap={{ dump.anchor.snapshotUid }}
        mana={{ dump.anchor.manaUsed }}/{{ dump.anchor.manaLimit }}
        code={{ dump.code.length }}b
        mem={{ dump.memory.length }}b
        events={{ dump.events.length }}b
        · expect
        <strong data-testid="expect-matches">{{ expectMatches }}</strong>
      </div>
      <Button
        data-testid="close-dump"
        label="Close"
        icon="pi pi-times"
        severity="secondary"
        size="small"
        class="ml-auto"
        @click="$emit('close')"
      />
    </div>

    <Message
      v-if="lastError"
      data-testid="replay-error"
      severity="error"
      class="shrink-0 mx-3 mt-2"
      :closable="false"
    >
      Replay error at index {{ runtime.state.index }}: {{ lastError }}
    </Message>

    <div class="shrink-0 px-3 pt-2">
      <Scrubber
        :index="scrubberIndex"
        :total="scrubberTotal"
        :busy="busy"
        :unit-label="scrubberUnitLabel"
        :at-end="scrubberAtEnd"
        :slider-max-override="scrubberSliderMax"
        @seek="onScrubberSeek"
        @step="onStep"
        @run="onRun"
        @reset="onReset"
      />
    </div>

    <Tabs
      v-model:value="activeTab"
      data-testid="recording-tabs"
      :lazy="true"
      class="recording-tabs flex-1 flex flex-col min-h-0 px-3 pb-2 pt-1"
    >
      <TabList class="shrink-0">
        <Tab value="events" data-testid="tab-events">Events</Tab>
        <Tab value="messages" data-testid="tab-messages">Messages</Tab>
        <Tab value="api" data-testid="tab-api">API</Tab>
        <Tab value="environment" data-testid="tab-environment">Environment</Tab>
      </TabList>
      <TabPanels class="recording-tab-panels flex-1 min-h-0 overflow-hidden">
        <TabPanel value="events" class="h-full min-h-0">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full min-h-0 pt-2">
            <Timeline
              class="min-h-0 h-full"
              :frames="runtime.frames"
              :current-index="runtime.state.index"
              :selected-index="selectedIndex"
              :highlight-indices="highlightFrameIndices"
              @select="onSelectFrame"
            />
            <FrameDetail
              class="min-h-0 h-full overflow-auto"
              :frame="selectedFrame"
              :process-id="dump.session.processId"
              :topology="topologySnapshot"
              :registries="registriesSnapshot"
              :replay-error="frameReplayError"
            />
          </div>
        </TabPanel>
        <TabPanel value="messages" class="h-full min-h-0">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full min-h-0 pt-2">
            <MessageStream
              class="min-h-0 h-full"
              :messages="streamMessages"
              :selected-id="selectedMessageId"
              :current-id="messageForCursor?.id ?? null"
              @select="onSelectMessage"
              @jump="onJumpToEvent"
            />
            <MessageDetail
              class="min-h-0 h-full overflow-auto"
              :message="selectedMessage"
              :registries="dump.registries"
              @jump="onJumpToEvent"
            />
          </div>
        </TabPanel>
        <TabPanel value="api" class="h-full min-h-0">
          <RecordingApiView class="h-full" :registries="dump.registries" />
        </TabPanel>
        <TabPanel value="environment" class="h-full min-h-0">
          <EnvironmentView
            class="h-full"
            :process-id="dump.session.processId"
            :topology="topologySnapshot"
            :registries="registriesSnapshot"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import Button from 'primevue/button'
  import Message from 'primevue/message'
  import Tabs from 'primevue/tabs'
  import TabList from 'primevue/tablist'
  import Tab from 'primevue/tab'
  import TabPanels from 'primevue/tabpanels'
  import TabPanel from 'primevue/tabpanel'
  import Scrubber from './recording/Scrubber.vue'
  import Timeline from './recording/Timeline.vue'
  import FrameDetail from './recording/FrameDetail.vue'
  import MessageStream from './recording/MessageStream.vue'
  import MessageDetail from './recording/MessageDetail.vue'
  import RecordingApiView from './recording/RecordingApiView.vue'
  import EnvironmentView from './recording/EnvironmentView.vue'
  import {
    installReplayDevtools,
    buildMessageStream,
    enrichRpcMessages,
    messageAtEventIndex,
    nextMessage,
    steppableMessages,
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
  const activeTab = ref<'events' | 'messages' | 'api' | 'environment'>('events')
  const selectedMessageId = ref<number | null>(null)
  const highlightFrameIndices = ref<number[] | undefined>(undefined)

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
    const failedAt = props.runtime.state.index - 1
    if (selectedIndex.value === failedAt || selectedIndex.value === props.runtime.state.index) {
      return err.message
    }
    return undefined
  })

  const streamMessages = computed(() => {
    const raw = buildMessageStream(
      props.runtime.frames,
      dump.value.session.processId,
      dump.value.bindings,
      dump.value.registries
    )
    return enrichRpcMessages(raw, dump.value.registries)
  })

  const steppable = computed(() => steppableMessages(streamMessages.value))

  const messageForCursor = computed(() =>
    messageAtEventIndex(streamMessages.value, uiIndex.value)
  )

  const selectedMessage = computed(() => {
    if (selectedMessageId.value === null) return null
    return streamMessages.value.find((m) => m.id === selectedMessageId.value) ?? null
  })

  const messagesMode = computed(() => activeTab.value === 'messages')

  const scrubberIndex = computed(() => {
    if (!messagesMode.value) return uiIndex.value
    const msg = messageForCursor.value
    if (!msg) return 0
    const i = steppable.value.findIndex((m) => m.id === msg.id)
    return i < 0 ? 0 : i
  })

  const scrubberTotal = computed(() =>
    messagesMode.value ? steppable.value.length : props.runtime.frames.length
  )

  const scrubberUnitLabel = computed(() =>
    messagesMode.value ? 'messages' : 'events'
  )

  const scrubberAtEnd = computed(() => {
    if (!messagesMode.value) return undefined
    const n = steppable.value.length
    if (n === 0) return true
    return scrubberIndex.value >= n - 1
  })

  const scrubberSliderMax = computed(() => {
    if (!messagesMode.value) return undefined
    return Math.max(steppable.value.length - 1, 0)
  })

  function refresh() {
    tick.value += 1
  }

  function syncMessageFromEvent() {
    const msg = messageAtEventIndex(streamMessages.value, props.runtime.state.index)
    if (!msg) {
      selectedMessageId.value = null
      highlightFrameIndices.value = undefined
      return
    }
    selectedMessageId.value = msg.id
    highlightFrameIndices.value = msg.frameIndices
  }

  watch(uiIndex, () => {
    syncMessageFromEvent()
  })

  watch(activeTab, (tab) => {
    if (tab === 'messages') syncMessageFromEvent()
  })

  onMounted(() => {
    installReplayDevtools(props.runtime, () => {
      selectedIndex.value = props.runtime.state.index
      refresh()
      syncMessageFromEvent()
    })
    selectedIndex.value = props.runtime.state.index
    syncMessageFromEvent()
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
      syncMessageFromEvent()
    } finally {
      busy.value = false
    }
  }

  async function onScrubberSeek(value: number) {
    if (messagesMode.value) {
      const msg = steppable.value[value]
      if (!msg) return
      await focusMessage(msg.id, msg.frameIndices[0] ?? 0)
      return
    }
    await onSeek(value)
  }

  async function onSelectFrame(index: number) {
    selectedIndex.value = index
    if (index !== props.runtime.state.index) {
      await onSeek(index)
    } else {
      syncMessageFromEvent()
    }
  }

  async function focusMessage(id: number, frameIndex: number) {
    selectedMessageId.value = id
    const msg = streamMessages.value.find((m) => m.id === id)
    highlightFrameIndices.value = msg?.frameIndices
    selectedIndex.value = frameIndex
    if (frameIndex !== props.runtime.state.index) {
      await onSeek(frameIndex)
    } else {
      syncMessageFromEvent()
    }
  }

  async function onSelectMessage(id: number) {
    const msg = streamMessages.value.find((m) => m.id === id)
    if (!msg) return
    await focusMessage(id, msg.frameIndices[0] ?? 0)
  }

  async function onJumpToEvent(frameIndex: number) {
    const msg = selectedMessage.value
    highlightFrameIndices.value = msg?.frameIndices
    activeTab.value = 'events'
    await onSelectFrame(frameIndex)
  }

  async function onStep() {
    if (messagesMode.value) {
      const nxt = nextMessage(streamMessages.value, selectedMessageId.value)
      if (!nxt) return
      await focusMessage(nxt.id, nxt.frameIndices[0] ?? 0)
      return
    }
    try {
      props.runtime.step()
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
    }
    selectedIndex.value = props.runtime.state.index
    refresh()
    syncMessageFromEvent()
  }

  function onRun() {
    try {
      props.runtime.run()
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
    }
    selectedIndex.value = props.runtime.state.index
    refresh()
    syncMessageFromEvent()
  }

  async function onReset() {
    if (messagesMode.value && steppable.value.length > 0) {
      const first = steppable.value[0]!
      await focusMessage(first.id, first.frameIndices[0] ?? 0)
      return
    }
    await onSeek(0)
  }
</script>

<style scoped>
  .recording-tabs :deep(.p-tabpanels) {
    flex: 1 1 0%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
  }

  .recording-tabs :deep(.p-tabpanel) {
    flex: 1 1 0%;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .recording-tabs :deep(.p-tabpanels > .p-tabpanel:not([hidden]), .p-tabpanels > .p-tabpanel[data-p-active='true']) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
