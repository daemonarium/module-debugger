<script setup lang="ts">
import { computed } from 'vue'
import type { TypeDescription, TypeRegistry } from '@wa-os/ts-rpc'
import TypeViewer from '../TypeViewer.vue'
import { shouldShowOwnerChip } from './ownerChip.js'

const props = withDefaults(
  defineProps<{
    mode: 'request' | 'response'
    methodName?: string
    ownerTypeName?: string
    paramTypes?: Array<{ name: string; typeName: string; type: TypeDescription }>
    returnType?: TypeDescription
    returnTypeName?: string
    registry?: TypeRegistry | null
  }>(),
  {
    mode: 'request'
  }
)

const showOwner = computed(() =>
  shouldShowOwnerChip(props.ownerTypeName, props.methodName)
)

const methodLabel = computed(() => props.methodName || 'unknown_method')

const hasParams = computed(() => props.paramTypes && props.paramTypes.length > 0)
</script>

<template>
  <div class="inline-flex flex-wrap items-baseline gap-1 font-mono text-sm leading-snug">
    <template v-if="mode === 'request'">
      <span
        v-if="showOwner"
        class="inline-block px-1 py-0.5 rounded text-[10px] leading-none font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700"
        data-testid="owner-type-chip"
      >{{ ownerTypeName }}</span>
      <span class="font-semibold text-primary-600 dark:text-primary-400">
        {{ methodLabel }}
      </span>
      <span class="text-surface-500">(</span>
      <template v-if="hasParams">
        <span v-for="(p, index) in paramTypes" :key="index" class="inline-flex items-baseline">
          <span class="text-surface-700 dark:text-surface-300 mr-1">{{ p.name }}:</span>
          <TypeViewer
            v-if="registry"
            :type="p.type"
            :registry="registry"
            compact
            class="inline-block"
          />
          <span v-else class="text-surface-500">{{ p.typeName }}</span>
          <span v-if="index < (paramTypes?.length ?? 0) - 1" class="text-surface-500 mr-1">,</span>
        </span>
      </template>
      <span class="text-surface-500">)</span>
    </template>
    <template v-else>
      <span class="font-semibold text-primary-600 dark:text-primary-400">
        → {{ returnTypeName || 'void' }}
      </span>
    </template>
  </div>
</template>
