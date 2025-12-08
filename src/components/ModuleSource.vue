<template>
  <div class="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
    <h2 class="text-2xl font-bold">Load WebAssembly Module</h2>
    
    <Card class="w-full">
      <template #content>
        <div class="flex flex-col gap-4">
          <div>
            <label for="url-input" class="block mb-2 font-medium">Load from URL</label>
            <div class="flex gap-2">
              <InputText
                id="url-input"
                v-model="url"
                placeholder="https://example.com/module.wasm"
                class="flex-1"
                :disabled="loading"
              />
              <Button
                label="Load"
                icon="pi pi-download"
                :loading="loading"
                :disabled="!url || loading"
                @click="loadFromUrl"
              />
            </div>
          </div>

          <Divider>
            <span class="text-sm text-gray-500">OR</span>
          </Divider>

          <div>
            <label class="block mb-2 font-medium">Upload File</label>
            <FileUpload
              mode="basic"
              accept=".wasm"
              :maxFileSize="10000000"
              :disabled="loading"
              @select="onFileSelect"
              chooseLabel="Choose WASM File"
              class="w-full"
            />
          </div>

          <Message
            v-if="error"
            severity="error"
            :closable="true"
            @close="error = null"
          >
            {{ error }}
          </Message>

          <Message
            v-if="success"
            severity="success"
            :closable="true"
            @close="success = false"
          >
            Module loaded successfully
          </Message>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import Card from 'primevue/card'
  import InputText from 'primevue/inputtext'
  import Button from 'primevue/button'
  import FileUpload from 'primevue/fileupload'
  import Divider from 'primevue/divider'
  import Message from 'primevue/message'

  interface Props {
    modelValue: WebAssembly.Module | null
  }

  interface Emits {
    (e: 'update:modelValue', value: WebAssembly.Module | null): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const url = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const success = ref(false)

  async function compileModule(buffer: ArrayBuffer): Promise<WebAssembly.Module> {
    try {
      const module = await WebAssembly.compile(buffer)
      return module
    } catch (err) {
      throw new Error(`Failed to compile WebAssembly module: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function loadFromUrl() {
    if (!url.value) return

    loading.value = true
    error.value = null
    success.value = false

    try {
      const response = await fetch(url.value)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const module = await compileModule(buffer)
      
      emit('update:modelValue', module)
      success.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load module from URL'
      emit('update:modelValue', null)
    } finally {
      loading.value = false
    }
  }

  async function onFileSelect(event: { files: File[] }) {
    const file = event.files?.[0]
    if (!file) return

    loading.value = true
    error.value = null
    success.value = false

    try {
      const buffer = await file.arrayBuffer()
      const module = await compileModule(buffer)
      
      emit('update:modelValue', module)
      success.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to compile module from file'
      emit('update:modelValue', null)
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped></style>

