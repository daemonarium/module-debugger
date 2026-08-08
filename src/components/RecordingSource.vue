<template>
  <div data-testid="recording-source" class="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
    <h2 class="text-2xl font-bold m-0">Open recording dump</h2>

    <Card class="w-full">
      <template #content>
        <div class="flex flex-col gap-4">
          <div data-testid="waosrec-upload">
            <label class="block mb-2 font-medium">Upload `.waosrec`</label>
            <FileUpload
              mode="basic"
              accept=".waosrec,application/octet-stream"
              :maxFileSize="200000000"
              :disabled="loading"
              chooseLabel="Choose .waosrec"
              class="w-full"
              @select="onWaosrecSelect"
            />
          </div>

          <Divider>
            <span class="text-sm text-gray-500">OR</span>
          </Divider>

          <div>
            <label class="block mb-2 font-medium">Open session folder</label>
            <Button
              data-testid="session-dir-btn"
              label="Choose session directory"
              icon="pi pi-folder-open"
              :loading="loading"
              :disabled="loading || !directoryPickerSupported"
              @click="onDirectoryPick"
            />
            <p
              v-if="!directoryPickerSupported"
              data-testid="session-dir-unsupported"
              class="text-xs text-amber-700 mt-2"
            >
              Directory picker is not supported in this browser — use `.waosrec` upload.
            </p>
          </div>

          <Message
            v-if="error"
            data-testid="source-error"
            severity="error"
            :closable="true"
            @close="error = null"
          >
            {{ error }}
          </Message>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import Card from 'primevue/card'
  import Button from 'primevue/button'
  import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload'
  import Divider from 'primevue/divider'
  import Message from 'primevue/message'
  import {
    loadWaosrec,
    loadWaosrecTypeRegistry,
    buildDumpFromSessionFiles,
    type RecordingDump,
    type SessionFileMap,
  } from '../replay/browser'

  const emit = defineEmits<{
    loaded: [dump: RecordingDump]
  }>()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const directoryPickerSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window

  async function onWaosrecSelect(event: FileUploadSelectEvent) {
    const file = event.files?.[0]
    if (!file) return
    loading.value = true
    error.value = null
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const registry = await loadWaosrecTypeRegistry()
      const dump = loadWaosrec(bytes, registry)
      emit('loaded', dump)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function onDirectoryPick() {
    loading.value = true
    error.value = null
    try {
      // @ts-expect-error File System Access API
      const handle = await window.showDirectoryPicker()
      const files: SessionFileMap = new Map()
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind !== 'file') continue
        const file = await entry.getFile()
        files.set(name, new Uint8Array(await file.arrayBuffer()))
      }
      const registry = await loadWaosrecTypeRegistry()
      const dump = buildDumpFromSessionFiles(files, registry)
      emit('loaded', dump)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }
</script>
