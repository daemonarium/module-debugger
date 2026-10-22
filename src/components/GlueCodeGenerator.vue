<template>
  <Card class="w-full">
    <template #title>
      <div class="flex items-center gap-2">
        <span class="text-xl font-semibold">Glue Code Generator</span>
      </div>
    </template>
    <template #content>
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <label class="text-sm font-medium">Language:</label>
          <Select
            v-model="selectedLanguage"
            :options="availableLanguages"
            optionLabel="name"
            placeholder="Select language"
            class="w-48"
          />
          <Button
            label="Generate"
            icon="pi pi-code"
            @click="generateCode"
            :disabled="!selectedLanguage || !module?.rpcDescription"
            :loading="generating"
          />
          <Button
            v-if="generatedCode"
            label="Copy"
            icon="pi pi-copy"
            @click="copyCode"
            severity="secondary"
          />
        </div>

        <div v-if="error" class="mt-4">
          <Message severity="error" :closable="true" @close="error = ''">
            {{ error }}
          </Message>
        </div>

        <div v-if="generatedCode" class="mt-4">
          <label class="text-sm font-medium mb-2 block">Generated Code:</label>
          <CodeHighlighter
            :code="generatedCode"
            :language="highlightLanguage"
          />
        </div>

        <div v-if="!module?.rpcDescription" class="text-gray-500 text-sm">
          No RPC description available. Please load a module first.
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import Card from 'primevue/card'
  import Button from 'primevue/button'
  import Select from 'primevue/select'
  import Message from 'primevue/message'
  import { useToast } from 'primevue/usetoast'
  import CodeHighlighter from './CodeHighlighter.vue'
  import { Module } from '../module'
  import { glueCodeGenerators } from '@daemonarium/rpc'

  const props = defineProps<{
    module: Module
  }>()

  const toast = useToast()
  const selectedLanguage = ref<{ name: string } | null>(null)
  const generatedCode = ref<string>('')
  const generating = ref(false)
  const error = ref<string>('')

  const availableLanguages = computed(() => {
    return glueCodeGenerators.map(gen => ({ name: gen.name }))
  })

  const highlightLanguage = computed(() => {
    if (!selectedLanguage.value) {
      return 'cpp'
    }
    // Map language names to highlight language codes
    const languageMap: Record<string, 'cpp' | 'javascript' | 'typescript' | 'rust' | 'go'> = {
      'C++': 'cpp',
      'C++ Client': 'cpp',
      'C++ Server': 'cpp',
      'JavaScript': 'javascript',
      'TypeScript': 'typescript',
      'Rust': 'rust',
      'Go': 'go'
    }
    return languageMap[selectedLanguage.value.name] || 'cpp'
  })

  async function generateCode() {
    if (!selectedLanguage.value || !props.module?.rpcDescription) {
      return
    }

    generating.value = true
    error.value = ''
    generatedCode.value = ''

    try {
      const generator = glueCodeGenerators.find(gen => gen.name === selectedLanguage.value!.name)
      if (!generator) {
        throw new Error(`Generator for ${selectedLanguage.value.name} not found`)
      }

      const code = await generator.generate(props.module.rpcDescription)
      generatedCode.value = code
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      generating.value = false
    }
  }

  async function copyCode() {
    if (!generatedCode.value) {
      return
    }

    try {
      await navigator.clipboard.writeText(generatedCode.value)
      toast.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Code copied to clipboard',
        life: 3000
      })
    } catch (err) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to copy code to clipboard',
        life: 3000
      })
    }
  }
</script>

<style scoped></style>
