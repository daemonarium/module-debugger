<template>
  <div class="data-view p-4 border border-gray-200 rounded-lg bg-white;">
    <!-- Header with kind and requestId -->
    <div class="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded">
      <Tag :value="kind.toUpperCase()" :severity="kind === 'request' ? 'info' : (success ? 'success' : 'error')" />
      <span v-if="requestId !== undefined" class="text-sm text-gray-600">
        Request ID: {{ requestId }}
      </span>
      <span v-if="kind === 'response' && success !== undefined" class="text-sm" :class="success ? 'text-green-600' : 'text-red-600'">
        {{ success ? 'Success' : 'Error' }}
      </span>
      <span v-if="kind === 'request' && (methodId !== undefined || extractedMethodId !== undefined)" class="text-sm text-gray-600">
        Method ID: {{ methodId !== undefined ? methodId : extractedMethodId }}
      </span>
    </div>

    <!-- Binary data preview -->
    <div class="mb-3">
      <div class="text-xs font-semibold text-gray-600 mb-1">Raw Binary Data ({{ data.length }} bytes):</div>
      <div class="font-mono text-xs bg-gray-900 text-green-400 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
        {{ binaryPreview }}
      </div>
    </div>

    <!-- Deserialized data -->
    <div v-if="deserializedValue !== null">
      <div class="text-xs font-semibold text-gray-600 mb-2">Deserialized Data:</div>
      
      <!-- Request: Method/Function parameters -->
      <div v-if="kind === 'request' && (type.kind === TypeKind.Method || type.kind === TypeKind.Function)">
        <div v-if="type.members && type.members.length > 0">
          <div class="text-sm font-medium text-gray-700 mb-2">Parameters:</div>
          <div class="space-y-3 ml-4">
            <div v-for="(param, index) in type.members" :key="param.name || index" class="border-l-2 border-blue-200 pl-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-sm font-semibold">{{ param.name || `Param ${index}` }}</span>
                <Tag
                  v-for="annotation in param.annotations"
                  :key="getAnnotationKey(annotation)"
                  :value="getAnnotationName(annotation)"
                  severity="secondary"
                  class="text-xs"
                />
              </div>
              <div v-if="paramValues[index] !== undefined">
                <TypeViewer
                  :type="param.type"
                  :registry="registry"
                  :expanded-types="expandedTypes"
                  @toggle-expand="handleToggleExpand"
                  class="mt-1"
                />
                <div class="mt-1 text-sm bg-gray-50 p-2 rounded">
                  <ValueTreeViewer
                    :value="paramValues[index]"
                    :type="param.type"
                    :registry="registry"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-500">No parameters</div>
      </div>

      <!-- Response: Success with return type -->
      <div v-else-if="kind === 'response' && success">
        <TypeViewer
          :type="type"
          :registry="registry"
          :expanded-types="expandedTypes"
          @toggle-expand="handleToggleExpand"
        />
        <div v-if="deserializedValue !== undefined" class="mt-2 text-sm bg-gray-50 p-2 rounded">
          <ValueTreeViewer
            :value="deserializedValue"
            :type="type"
            :registry="registry"
          />
        </div>
      </div>

      <!-- Response: Error -->
      <div v-else-if="kind === 'response' && !success">
        <div class="text-red-600 font-semibold mb-2">Error Message:</div>
        <div class="font-mono text-sm bg-red-50 p-2 rounded border border-red-200 mb-2">
          {{ errorMessage }}
        </div>
        <div v-if="deserializedValue !== null && deserializedValue !== undefined" class="mt-2">
          <div class="text-xs font-semibold text-gray-600 mb-1">Deserialized as {{ type.name }}:</div>
          <div class="text-sm bg-gray-50 p-2 rounded border border-gray-200">
            <ValueTreeViewer
              :value="deserializedValue"
              :type="type"
              :registry="registry"
            />
          </div>
        </div>
      </div>

      <!-- Normal structures -->
      <div v-else>
        <TypeViewer
          :type="type"
          :registry="registry"
          :expanded-types="expandedTypes"
          @toggle-expand="handleToggleExpand"
        />
        <div v-if="deserializedValue !== undefined" class="mt-2 text-sm bg-gray-50 p-2 rounded">
          <ValueTreeViewer
            :value="deserializedValue"
            :type="type"
            :registry="registry"
          />
        </div>
      </div>
    </div>

    <!-- Error deserializing -->
    <div v-else-if="deserializationError" class="text-red-600 text-sm">
      Failed to deserialize: {{ deserializationError }}
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import Tag from 'primevue/tag'
  import TypeViewer from './TypeViewer.vue'
import ValueTreeViewer from './ValueTreeViewer.vue'
  import type { TypeDescription, TypeRegistry, TypedValue } from '@daemonarium/rpc'
  import { TypeKind } from '@daemonarium/rpc'
  import { Reader } from '@daemonarium/rpc'
  import { deserializeValueByType } from '@daemonarium/rpc'
  import { CodecRegistry } from '@daemonarium/rpc'
  import { registerDynamicCodecs } from '@daemonarium/rpc'

  const props = defineProps<{
    data: Uint8Array
    type: TypeDescription
    registry: TypeRegistry
    kind: 'request' | 'response'
    requestId?: number
    success?: boolean
    methodId?: number
  }>()

  const expandedTypes = ref<Set<string>>(new Set())
  const deserializedValue = ref<any>(null)
  const paramValues = ref<any[]>([])
  const errorMessage = ref<string>('')
  const deserializationError = ref<string>('')
  const extractedMethodId = ref<number | undefined>(undefined)
  const codecs = new CodecRegistry()

  // Register dynamic codecs
  registerDynamicCodecs(codecs, props.registry)

  const binaryPreview = computed(() => {
    // Convert to hex string, grouping bytes
    const hex = Array.from(props.data)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ')
    // Limit display to first 256 bytes
    if (hex.length > 256 * 3) {
      return hex.substring(0, 256 * 3) + '...'
    }
    return hex
  })

  function handleToggleExpand(typeName: string) {
    if (expandedTypes.value.has(typeName)) {
      expandedTypes.value.delete(typeName)
    } else {
      expandedTypes.value.add(typeName)
    }
  }

  function formatValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null'
    }
    if (typeof value === 'string') {
      return JSON.stringify(value)
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  function getAnnotationKey(annotation: TypedValue): string {
    return annotation._type
  }

  function getAnnotationName(annotation: TypedValue): string {
    return annotation._type.replace('_annotation', '')
  }

  onMounted(() => {
    try {
      const reader = new Reader(props.data, codecs)
      
      if (props.kind === 'request') {
        // Request format: [requestId: u64][methodId: u64][id?][...params]
        const requestId = Number(reader.readU64())
        const methodId = Number(reader.readU64())
        extractedMethodId.value = methodId
        
        // Deserialize parameters if this is a Method/Function type
        if (props.type.kind === TypeKind.Method || props.type.kind === TypeKind.Function) {
          // For Method type (dynamic methods), there's an ID before params
          // We don't have ID type info here, so we'll skip it by trying to read it as u64
          // This is a simplification - in a real scenario we'd need ownerType info
          if (props.type.kind === TypeKind.Method) {
            // Skip ID - we don't deserialize it here, just note it exists
            // In a full implementation, we'd need ownerType to determine ID type
            const _id = reader.readU64() // Read and discard ID
          }
          
          if (props.type.members) {
            const params: any[] = []
            for (const param of props.type.members) {
              let paramValue: any
              deserializeValueByType(reader, props.registry, param.type, (value) => {
                paramValue = value
              })
              params.push(paramValue)
            }
            reader.readRest()
            paramValues.value = params
            deserializedValue.value = { parameters: params }
          } else {
            reader.readRest()
            deserializedValue.value = {}
          }
        } else {
          // Deserialize as normal structure
          let value: any
          deserializeValueByType(reader, props.registry, props.type, (val) => {
            value = val
          })
          reader.readRest()
          deserializedValue.value = value
        }
      } else if (props.kind === 'response') {
        // Response format: [requestId: u64][success: bool][result_or_error]
        const requestId = Number(reader.readU64())
        const success = reader.readBool()
        
        if (success) {
          // Deserialize result using return type
          if (props.type.kind !== TypeKind.Void) {
            let value: any
            deserializeValueByType(reader, props.registry, props.type, (val) => {
              value = val
            })
            reader.readRest()
            deserializedValue.value = value
          } else {
            reader.readRest()
            deserializedValue.value = undefined
          }
        } else {
          // Read error message
          errorMessage.value = reader.readString()
          // Also deserialize as string type for display
          reader.readRest()
          // Re-read from the point after success flag for deserialization
          const errorReader = new Reader(props.data, codecs)
          errorReader.readU64() // skip requestId
          errorReader.readBool() // skip success flag
          let errorValue: any
          deserializeValueByType(errorReader, props.registry, props.type, (val) => {
            errorValue = val
          })
          errorReader.readRest()
          deserializedValue.value = errorValue
        }
      } else {
        // Normal data structure
        let value: any
        deserializeValueByType(reader, props.registry, props.type, (val) => {
          value = val
        })
        reader.readRest()
        deserializedValue.value = value
      }
    } catch (error) {
      deserializationError.value = error instanceof Error ? error.message : String(error)
      console.error('Deserialization error:', error)
    }
  })
</script>

<style scoped>
</style>

