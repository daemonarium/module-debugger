<template>
  <div data-testid="recording-api-view" class="recording-api-view flex flex-col gap-3 h-full min-h-0 pt-2">
    <div v-if="registryOptions.length === 0" class="text-sm text-surface-500">
      No type registries available in this dump.
    </div>

    <template v-else>
      <div class="flex items-center gap-2 flex-wrap shrink-0">
        <label class="text-sm font-medium">Registry</label>
        <Select
          v-model="selectedKey"
          :options="registryOptions"
          option-label="label"
          option-value="value"
          class="min-w-[16rem]"
          size="small"
          data-testid="api-registry-select"
        />
      </div>

      <RegistryTypeBrowser
        class="flex-1 min-h-0"
        :registry-bytes="selectedBytes"
        :registry-key="selectedKey ?? undefined"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import Select from 'primevue/select'
  import RegistryTypeBrowser from './RegistryTypeBrowser.vue'

  const props = defineProps<{
    registries: Map<string, Uint8Array>
  }>()

  const selectedKey = ref<string | null>(null)

  const registryOptions = computed(() =>
    [...props.registries.entries()]
      .map(([key, bytes]) => ({
        label: `${key} (${bytes.length}b)`,
        value: key,
        size: bytes.length,
      }))
      .sort((a, b) => {
        if (a.size === 0 && b.size > 0) return 1
        if (b.size === 0 && a.size > 0) return -1
        return a.value.localeCompare(b.value)
      })
  )

  watch(
    registryOptions,
    (opts) => {
      if (opts.length === 0) {
        selectedKey.value = null
        return
      }
      if (!selectedKey.value || !opts.some((o) => o.value === selectedKey.value)) {
        const preferred = opts.find((o) => o.size > 0) ?? opts[0]!
        selectedKey.value = preferred.value
      }
    },
    { immediate: true }
  )

  const selectedBytes = computed(() => {
    if (!selectedKey.value) return null
    return props.registries.get(selectedKey.value) ?? null
  })
</script>
