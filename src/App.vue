<template>
  <div>
    <div class="flex items-center gap-3 p-3 border-b border-gray-200 bg-gray-50">
      <span class="font-semibold text-sm">module-debugger</span>
      <div data-testid="mode-select">
        <SelectButton
          v-model="mode"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />
      </div>
    </div>

    <template v-if="mode === 'recording'">
      <RecordingSource v-if="!replayRuntime" @loaded="onDumpLoaded" />
      <RecordingDebugger
        v-else
        :runtime="replayRuntime"
        @close="closeRecording"
      />
      <Message
        v-if="recordingError"
        data-testid="recording-load-error"
        severity="error"
        class="m-4"
        :closable="true"
        @close="recordingError = null"
      >
        {{ recordingError }}
      </Message>
    </template>

    <template v-else>
      <ModuleSource v-if="!wasmModule" v-model="wasmModule" />
      <ModuleDebugger v-if="module" :module="module" data-testid="module-debugger" />
      <Message
        v-if="interactiveError"
        data-testid="interactive-error"
        severity="error"
        class="m-4"
        :closable="true"
        @close="interactiveError = null"
      >
        {{ interactiveError }}
      </Message>
    </template>

    <Toast />
  </div>
</template>

<script setup lang="ts">
  // Product focus: recording dump debugger — see ../RECORDING_DEBUGGER.md and ../TODO.md
  // Interactive ModuleDebugger remains available behind the mode switch (§10).
  import ModuleSource from './components/ModuleSource.vue'
  import ModuleDebugger from './components/ModuleDebugger.vue'
  import RecordingSource from './components/RecordingSource.vue'
  import RecordingDebugger from './components/RecordingDebugger.vue'
  import Toast from 'primevue/toast'
  import SelectButton from 'primevue/selectbutton'
  import Message from 'primevue/message'

  import { shallowRef, ref, watch } from 'vue'
  import { Module } from './module'
  import { defaultHighlightStyle } from '@codemirror/language'
  import { StyleModule } from 'style-mod'
  import {
    ReplayRuntime,
    type RecordingDump,
  } from './replay/browser'

  if (typeof window !== 'undefined') {
    StyleModule.mount(window.document, defaultHighlightStyle.module)
  }

  const mode = ref<'recording' | 'interactive'>('recording')
  const modeOptions = [
    { label: 'Recording', value: 'recording' },
    { label: 'Interactive', value: 'interactive' },
  ]

  const replayRuntime = shallowRef<ReplayRuntime | null>(null)
  const recordingError = ref<string | null>(null)

  async function onDumpLoaded(dump: RecordingDump) {
    recordingError.value = null
    try {
      replayRuntime.value = await ReplayRuntime.create(dump)
    } catch (e) {
      recordingError.value = e instanceof Error ? e.message : String(e)
      replayRuntime.value = null
    }
  }

  function closeRecording() {
    replayRuntime.value = null
    recordingError.value = null
  }

  const wasmModule = shallowRef<WebAssembly.Module | null>(null)
  const module = shallowRef<Module | null>(null)
  const interactiveError = ref<string | null>(null)

  watch(wasmModule, async (newWasmModule) => {
    if (!newWasmModule) {
      module.value = null
      return
    }
    interactiveError.value = null
    try {
      const m = new Module(newWasmModule)
      await m.instantiate()
      //@ts-ignore
      globalThis.module = m
      //@ts-ignore
      globalThis.rpcDescription = m.rpcDescription
      module.value = m
    } catch (e) {
      interactiveError.value = e instanceof Error ? e.message : String(e)
      wasmModule.value = null
      module.value = null
    }
  })
</script>

<style scoped></style>

<style>
  @import "tailwindcss";
  @plugin "tailwindcss-primeui";

  @custom-variant dark (&:where(.app-dark-mode, .app-dark-mode *));

  :root {
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    font-family: var(--font-sans)
  }
  html,body
  {
    min-height: 100%;
    font-family: var(--font-sans);
    font-weight: 400;
  }

  @layer base {

    a {
      color: var(--p-blue-700);
      text-decoration: underline;
    }
    a:hover {
      color: var(--p-blue-900);
      text-decoration: none;
    }
    a:visited {
      color: var(--p-purple-800);
    }


    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
      text-align: left;
    }

    h1 {
      font-size: 2.0em;
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: 500;
      color: var(--p-surface-700);
    }

    h2 {
      font-size: 1.75em;
      margin-top: 1em;
      margin-bottom: 0.5em;
      color: var(--p-surface-700);
      font-weight: 500;
    }

    h3 {
      font-size: 1.5em;
      margin-top: 1em;
      margin-bottom: 0.5em;
      color: var(--p-surface-800);
      font-weight: 500;
    }

    h4 {
      font-size: 1.23em;
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: 500;
      color: var(--p-surface-800);
    }

    .app-dark-mode:not(.email-rendering) {
      a {
        color: var(--p-blue-400);
      }
      a:hover {
        color: var(--p-blue-500);
      }
      a:visited {
        color: var(--p-purple-400);
      }
      a:active {
        color: var(--p-blue-600);
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--p-surface-100);
      }
    }

    p {
      margin-top: 0.5em;
      margin-bottom: 0.5em;
    }

    pre {
      font-family: monospace;
    }

    ul {
      list-style: disc;
    }
    ol {
      list-style: decimal;
    }
    li {
      margin-top: 0.23em;
      margin-bottom: 0.23em;
    }
  }
</style>
