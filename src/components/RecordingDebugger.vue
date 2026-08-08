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
        <Tab value="events" data-testid="tab-events">
          <i class="pi pi-history mr-1" />Events
        </Tab>
        <Tab value="messages" data-testid="tab-messages">
          <i class="pi pi-comments mr-1" />Messages
        </Tab>
        <Tab value="api" data-testid="tab-api">
          <i class="pi pi-code mr-1" />API
        </Tab>
        <Tab value="environment" data-testid="tab-environment">
          <i class="pi pi-sitemap mr-1" />Environment
        </Tab>
      </TabList>
      <TabPanels class="recording-tab-panels flex-1 min-h-0 overflow-hidden">
        <TabPanel value="events" class="h-full min-h-0">
          <Splitter
            data-testid="events-splitter"
            class="h-full min-h-0 pt-2 recording-splitter"
            layout="horizontal"
          >
            <SplitterPanel :size="50" :min-size="20" class="min-h-0 overflow-hidden pr-1">
              <Timeline
                class="min-h-0 h-full"
                :frames="runtime.frames"
                :current-index="runtime.state.index"
                :selected-index="selectedIndex"
                :highlight-indices="highlightFrameIndices"
                @select="onSelectFrame"
              />
            </SplitterPanel>
            <SplitterPanel :size="50" :min-size="20" class="min-h-0 overflow-hidden pl-1">
              <FrameDetail
                class="min-h-0 h-full overflow-auto"
                :frame="selectedFrame"
                :process-id="dump.session.processId"
                :topology="topologySnapshot"
                :registries="registriesSnapshot"
                :replay-error="frameReplayError"
                @debug="onDebugFrame"
              />
            </SplitterPanel>
          </Splitter>
        </TabPanel>
        <TabPanel value="messages" class="h-full min-h-0">
          <Splitter
            data-testid="messages-splitter"
            class="h-full min-h-0 pt-2 recording-splitter"
            layout="horizontal"
          >
            <SplitterPanel :size="50" :min-size="20" class="min-h-0 overflow-hidden pr-1">
              <MessageStream
                class="min-h-0 h-full"
                :messages="streamMessages"
                :selected-id="selectedMessageId"
                :current-id="messageForCursor?.id ?? null"
                @select="onSelectMessage"
                @jump="onJumpToEvent"
                @debug="onDebugMessage"
                @navigate-socket="onNavigateSocket"
                @navigate-method="onNavigateMethod"
                @update:display-messages="onDisplayMessages"
              />
            </SplitterPanel>
            <SplitterPanel :size="50" :min-size="20" class="min-h-0 overflow-hidden pl-1">
              <MessageDetail
                class="min-h-0 h-full overflow-auto"
                :message="selectedMessage"
                :paired-message="pairedMessage"
                :registries="dump.registries"
                @jump="onJumpToEvent"
                @select="onSelectMessage"
                @debug="onDebugMessage"
                @navigate-socket="onNavigateSocket"
                @navigate-method="onNavigateMethod"
              />
            </SplitterPanel>
          </Splitter>
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
            :focus-socket="envFocus.socket"
            :focus-method="envFocus.method"
            :focus-nonce="envFocus.nonce"
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
  import Splitter from 'primevue/splitter'
  import SplitterPanel from 'primevue/splitterpanel'
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
    findPairedMessage,
    messageAtEventIndex,
    nextMessage,
    steppableMessages,
    num,
    type EnrichedStreamMessage,
    type ReplayRuntime,
    ReplayError,
  } from '../replay/browser'
  import {
    clearRecordingHash,
    hashesEqual,
    readRecordingHash,
    writeRecordingHash,
    type RecordingTab,
    type RecordingUiHash,
  } from '../replay/recordingHash.js'

  const props = defineProps<{
    runtime: ReplayRuntime
  }>()

  defineEmits<{
    close: []
  }>()

  const busy = ref(false)
  const selectedIndex = ref(0)
  const tick = ref(0)
  const activeTab = ref<RecordingTab>('messages')
  const selectedMessageId = ref<number | null>(null)
  const highlightFrameIndices = ref<number[] | undefined>(undefined)
  const displayMessages = ref<EnrichedStreamMessage[]>([])
  const envFocus = ref<{
    socket: number | null
    method: { ownerTypeName?: string; methodName: string } | null
    nonce: number
  }>({ socket: null, method: null, nonce: 0 })

  /** Skip push/replace while restoring from hash / popstate. */
  let suppressHashWrite = false

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

  const steppable = computed(() => steppableMessages(displayMessages.value))

  const messageForCursor = computed(() =>
    messageAtEventIndex(displayMessages.value.length ? displayMessages.value : streamMessages.value, uiIndex.value)
  )

  const selectedMessage = computed(() => {
    if (selectedMessageId.value === null) return null
    return streamMessages.value.find((m) => m.id === selectedMessageId.value) ?? null
  })

  const pairedMessage = computed(() =>
    findPairedMessage(streamMessages.value, selectedMessage.value)
  )

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

  function onDisplayMessages(list: EnrichedStreamMessage[]) {
    displayMessages.value = list
  }

  function snapshotUiHash(): RecordingUiHash {
    const state: RecordingUiHash = {
      tab: activeTab.value,
      frame: selectedIndex.value,
    }
    if (selectedMessageId.value !== null) state.msg = selectedMessageId.value
    if (envFocus.value.socket !== null && envFocus.value.socket !== undefined) {
      state.sock = envFocus.value.socket
      if (envFocus.value.method?.methodName) {
        state.method = envFocus.value.method.methodName
        if (envFocus.value.method.ownerTypeName) {
          state.owner = envFocus.value.method.ownerTypeName
        }
      }
    }
    return state
  }

  function commitHash(mode: 'push' | 'replace') {
    if (suppressHashWrite) return
    writeRecordingHash(snapshotUiHash(), mode)
  }

  function syncMessageFromEvent() {
    const pool = displayMessages.value.length ? displayMessages.value : streamMessages.value
    const msg = messageAtEventIndex(pool, props.runtime.state.index)
    if (!msg) {
      selectedMessageId.value = null
      highlightFrameIndices.value = undefined
      return
    }
    selectedMessageId.value = msg.id
    highlightFrameIndices.value = msg.frameIndices
  }

  async function applyUiHash(state: RecordingUiHash) {
    suppressHashWrite = true
    busy.value = true
    try {
      activeTab.value = state.tab
      if (state.sock !== undefined) {
        envFocus.value = {
          socket: state.sock,
          method: state.method
            ? { ownerTypeName: state.owner, methodName: state.method }
            : null,
          nonce: envFocus.value.nonce + 1,
        }
      } else {
        envFocus.value = { socket: null, method: null, nonce: envFocus.value.nonce + 1 }
      }

      const frame = state.frame ?? 0
      selectedIndex.value = frame
      if (frame !== props.runtime.state.index) {
        await props.runtime.seek(frame)
      }
      refresh()

      if (state.msg !== undefined) {
        const msg = streamMessages.value.find((m) => m.id === state.msg)
        if (msg) {
          selectedMessageId.value = msg.id
          highlightFrameIndices.value = msg.frameIndices
        } else {
          syncMessageFromEvent()
        }
      } else {
        syncMessageFromEvent()
      }
    } finally {
      busy.value = false
      suppressHashWrite = false
    }
  }

  async function onHashNavigation() {
    const state = readRecordingHash()
    if (!state) return
    if (hashesEqual(state, snapshotUiHash())) return
    await applyUiHash(state)
  }

  watch(uiIndex, () => {
    syncMessageFromEvent()
  })

  watch(activeTab, (tab) => {
    if (tab === 'messages') syncMessageFromEvent()
    // User clicked a tab (or code changed tab without suppress) → history entry
    commitHash('push')
  })

  onMounted(async () => {
    installReplayDevtools(props.runtime, () => {
      selectedIndex.value = props.runtime.state.index
      refresh()
      syncMessageFromEvent()
    })

    window.addEventListener('popstate', onHashNavigation)

    const initial = readRecordingHash()
    if (initial) {
      await applyUiHash(initial)
      commitHash('replace')
    } else {
      selectedIndex.value = props.runtime.state.index
      syncMessageFromEvent()
      commitHash('replace')
    }
  })

  onUnmounted(() => {
    installReplayDevtools(null)
    window.removeEventListener('popstate', onHashNavigation)
    clearRecordingHash()
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
      commitHash('push')
      return
    }
    await onSeek(value)
    commitHash('push')
  }

  async function onSelectFrame(index: number) {
    selectedIndex.value = index
    if (index !== props.runtime.state.index) {
      await onSeek(index)
    } else {
      syncMessageFromEvent()
    }
    commitHash('push')
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
    commitHash('push')
  }

  async function onJumpToEvent(frameIndex: number) {
    const msg = selectedMessage.value
    highlightFrameIndices.value = msg?.frameIndices
    suppressHashWrite = true
    try {
      activeTab.value = 'events'
      selectedIndex.value = frameIndex
      if (frameIndex !== props.runtime.state.index) {
        await onSeek(frameIndex)
      } else {
        syncMessageFromEvent()
      }
    } finally {
      suppressHashWrite = false
    }
    commitHash('push')
  }

  function onNavigateSocket(socket: number) {
    suppressHashWrite = true
    try {
      envFocus.value = {
        socket,
        method: null,
        nonce: envFocus.value.nonce + 1,
      }
      activeTab.value = 'environment'
    } finally {
      suppressHashWrite = false
    }
    commitHash('push')
  }

  function onNavigateMethod(payload: {
    socket: number
    ownerTypeName?: string
    methodName: string
  }) {
    suppressHashWrite = true
    try {
      envFocus.value = {
        socket: payload.socket,
        method: {
          ownerTypeName: payload.ownerTypeName,
          methodName: payload.methodName,
        },
        nonce: envFocus.value.nonce + 1,
      }
      activeTab.value = 'environment'
    } finally {
      suppressHashWrite = false
    }
    commitHash('push')
  }

  async function onDebugMessage(id: number) {
    const msg = streamMessages.value.find((m) => m.id === id)
    if (!msg || msg.direction !== 'in' || !msg.frameIndices.length) return
    const from = msg.frameIndices[0]!
    busy.value = true
    try {
      const dataIndex = await props.runtime.debugFromFrame(from, msg.socket)
      if (dataIndex === null) return
      selectedIndex.value = props.runtime.state.index
      refresh()
      syncMessageFromEvent()
      commitHash('replace')
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
      refresh()
    } finally {
      busy.value = false
    }
  }

  async function onDebugFrame() {
    const frame = selectedFrame.value
    if (!frame || frame.class !== 'stimulus') return
    const socket = num(frame.header.socket)
    const from = selectedIndex.value
    busy.value = true
    try {
      const dataIndex = await props.runtime.debugFromFrame(from, socket)
      if (dataIndex === null) return
      selectedIndex.value = props.runtime.state.index
      refresh()
      syncMessageFromEvent()
      commitHash('replace')
    } catch (e) {
      if (!(e instanceof ReplayError)) throw e
      refresh()
    } finally {
      busy.value = false
    }
  }

  async function onStep() {
    if (messagesMode.value) {
      const nxt = nextMessage(displayMessages.value.length ? displayMessages.value : streamMessages.value, selectedMessageId.value)
      if (!nxt) return
      await focusMessage(nxt.id, nxt.frameIndices[0] ?? 0)
      commitHash('push')
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
    commitHash('push')
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
    commitHash('replace')
  }

  async function onReset() {
    if (messagesMode.value && steppable.value.length > 0) {
      const first = steppable.value[0]!
      await focusMessage(first.id, first.frameIndices[0] ?? 0)
      commitHash('push')
      return
    }
    await onSeek(0)
    commitHash('push')
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

  .recording-splitter {
    border: none;
    background: transparent;
  }

  .recording-splitter :deep(.p-splitter-gutter) {
    background: transparent;
  }
</style>
