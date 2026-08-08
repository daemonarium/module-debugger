<script setup lang="ts">
import { computed } from 'vue'
import type { TypeDescription, TypeRegistry } from '@wa-os/ts-rpc'
import { TypeKind } from '@wa-os/ts-rpc'
import TypeViewer from '../TypeViewer.vue'
import { shouldShowOwnerChip } from './ownerChip.js'
import { formatPreviewValue } from '../../replay/browser'
import type { RpcCallArg } from '../../replay/browser'

const props = withDefaults(
  defineProps<{
    mode: 'request' | 'response'
    methodName?: string
    ownerTypeName?: string
    paramTypes?: Array<{ name: string; typeName: string; type: TypeDescription }>
    returnType?: TypeDescription
    returnTypeName?: string
    registry?: TypeRegistry | null
    showTypes?: boolean
    showParamValues?: boolean
    args?: RpcCallArg[]
    showResult?: boolean
    resultValue?: unknown
    clickableMethod?: boolean
  }>(),
  {
    mode: 'request',
    showTypes: true,
    showParamValues: false,
    showResult: false,
    clickableMethod: false,
  }
)

const emit = defineEmits<{
  'click-method': []
}>()

const showOwner = computed(() =>
  shouldShowOwnerChip(props.ownerTypeName, props.methodName)
)

const methodLabel = computed(() => props.methodName || 'unknown_method')

const hasParams = computed(() => props.paramTypes && props.paramTypes.length > 0)

const isVoidReturn = computed(() => {
  if (props.returnType?.kind === TypeKind.Void) return true
  const name = (props.returnTypeName || props.returnType?.name || '').toLowerCase()
  return name === 'void'
})

/** Never preview void results (avoids ugly "undefined"). */
const effectiveShowResult = computed(() => props.showResult && !isVoidReturn.value)

function argValueFor(name: string): unknown {
  return props.args?.find((a) => a.name === name)?.value
}
</script>

<template>
  <div class="inline-flex flex-wrap items-baseline gap-1 font-mono text-sm leading-snug">
    <template v-if="mode === 'request'">
      <span
        v-if="showOwner"
        class="inline-block px-1 py-0.5 rounded text-[10px] leading-none font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700"
        data-testid="owner-type-chip"
      >{{ ownerTypeName }}</span>
      <span
        data-testid="method-name"
        class="font-semibold text-primary-600 dark:text-primary-400"
        :class="clickableMethod ? 'cursor-pointer hover:underline' : ''"
        @click.stop="clickableMethod && emit('click-method')"
      >
        {{ methodLabel }}
      </span>
      <span class="text-surface-500">(</span>
      <template v-if="hasParams">
        <span v-for="(p, index) in paramTypes" :key="index" class="inline-flex items-baseline">
          <span class="text-surface-700 dark:text-surface-300">{{ p.name }}</span>
          <template v-if="showParamValues">
            <span class="text-surface-500">=</span>
            <span class="text-emerald-700 dark:text-emerald-400">{{ formatPreviewValue(argValueFor(p.name)) }}</span>
          </template>
          <template v-if="showTypes">
            <span class="text-surface-500 mr-0.5">:</span>
            <TypeViewer
              v-if="registry"
              :type="p.type"
              :registry="registry"
              compact
              class="inline-block"
            />
            <span v-else class="text-surface-500">{{ p.typeName }}</span>
          </template>
          <span v-if="index < (paramTypes?.length ?? 0) - 1" class="text-surface-500 mr-1">,</span>
        </span>
      </template>
      <span class="text-surface-500">)</span>
      <template v-if="effectiveShowResult">
        <span class="text-surface-500 mx-0.5">→</span>
        <span class="text-emerald-700 dark:text-emerald-400">{{ formatPreviewValue(resultValue) }}</span>
        <template v-if="showTypes">
          <span class="text-surface-500 mr-0.5">:</span>
          <span class="text-surface-500">{{ returnTypeName || 'void' }}</span>
        </template>
      </template>
    </template>
    <template v-else>
      <span class="font-semibold text-primary-600 dark:text-primary-400">→</span>
      <template v-if="effectiveShowResult">
        <span class="text-emerald-700 dark:text-emerald-400">{{ formatPreviewValue(resultValue) }}</span>
      </template>
      <template v-if="showTypes">
        <span v-if="effectiveShowResult" class="text-surface-500">:</span>
        <span class="font-semibold text-primary-600 dark:text-primary-400">
          {{ returnTypeName || 'void' }}
        </span>
      </template>
      <span v-else-if="!effectiveShowResult" class="font-semibold text-primary-600 dark:text-primary-400">
        {{ returnTypeName || 'void' }}
      </span>
    </template>
  </div>
</template>
