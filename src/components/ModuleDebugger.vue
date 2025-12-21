<template>
  <div class="flex flex-col gap-6 p-6">
    <h1 class="text-3xl font-bold">Module Debugger</h1>
    
    <div v-if="!module?.rpcDescription" class="text-gray-500">
      No RPC description available. Please load a module first.
    </div>

    <div v-else class="space-y-6">
      <GlueCodeGenerator :module="module" />
      
      <Card v-for="objectType in objectTypesWithMethods" :key="objectType.name" class="w-full">
        <template #title>
          <div class="flex items-center gap-2">
            <span class="font-mono text-lg">{{ objectType.name }}</span>
            <Tag value="object" severity="info" />
            <Tag
              v-for="annotation in objectType.annotations"
              :key="getAnnotationKey(annotation)"
              :value="getAnnotationName(annotation)"
              severity="info"
            />
          </div>
        </template>
        <template #content>
          <div class="space-y-4">
            <!-- Methods -->
            <div v-for="methodMember in getMethods(objectType)" :key="methodMember.name" class="border-l-2 border-blue-200 pl-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-mono font-semibold">{{ methodMember.name }}</span>
                <Tag v-if="methodMember.type.kind === TypeKind.Method" value="method" severity="primary" />
                <Tag v-if="methodMember.type.kind === TypeKind.Function" value="function" severity="success" />
                <Tag
                  v-for="annotation in methodMember.annotations"
                  :key="getAnnotationKey(annotation)"
                  :value="getAnnotationName(annotation)"
                  severity="info"
                  class="text-xs"
                />
              </div>
              
              <!-- Parameters -->
              <div v-if="methodMember.type.members && methodMember.type.members.length > 0" class="mb-3">
                <div class="text-sm font-medium text-gray-600 mb-2">Parameters:</div>
                <div class="space-y-2 ml-4">
                  <div v-for="param in methodMember.type.members" :key="param.name" class="flex items-start gap-2">
                    <div class="mr-5">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-mono text-sm font-semibold">{{ param.name }}</span>
                        <Tag
                          v-for="annotation in param.annotations"
                          :key="getAnnotationKey(annotation)"
                          :value="getAnnotationName(annotation)"
                          severity="secondary"
                          class="text-xs"
                        />
                      </div>
                      <TypeViewer
                        :type="param.type"
                        :registry="module.rpcDescription!"
                        :expanded-types="expandedTypes"
                        @toggle-expand="handleToggleExpand"
                        class="ml-2"
                      />
                    </div>
                    <InputText
                      v-model="methodParams[`${objectType.name}.${methodMember.name}.${param.name}`]"
                      :placeholder="getTypePlaceholder(param.type)"
                      class="w-64"
                    />
                  </div>
                </div>
              </div>

              <!-- Return type -->
              <div v-if="methodMember.type.item" class="mb-3">
                <div class="text-sm font-medium text-gray-600 mb-2">Returns:</div>
                <TypeViewer
                  :type="methodMember.type.item"
                  :registry="module.rpcDescription!"
                  :expanded-types="expandedTypes"
                  @toggle-expand="handleToggleExpand"
                  class="ml-4"
                />
              </div>

              <!-- Call button -->
              <div class="mt-3">
                <Button
                  label="Call Method"
                  icon="pi pi-play"
                  :loading="callingMethods[`${objectType.name}.${methodMember.name}`]"
                  @click="callMethod(objectType, methodMember)"
                  :disabled="!canCallMethod(objectType, methodMember)"
                />
                <Message
                  v-if="methodResults[`${objectType.name}.${methodMember.name}`] || methodErrors[`${objectType.name}.${methodMember.name}`]"
                  :severity="methodErrors[`${objectType.name}.${methodMember.name}`] ? 'error' : 'success'"
                  :closable="true"
                  @close="clearMethodResult(objectType.name, methodMember.name)"
                  class="mt-2"
                >
                  <div v-if="methodErrors[`${objectType.name}.${methodMember.name}`]">
                    {{ methodErrors[`${objectType.name}.${methodMember.name}`] }}
                  </div>
                  <div v-else class="font-mono text-sm">
                    {{ formatResult(methodResults[`${objectType.name}.${methodMember.name}`]) }}
                  </div>
                </Message>
              </div>
            </div>

            <!-- No methods message -->
            <div v-if="getMethods(objectType).length === 0" class="text-gray-500 text-sm">
              No methods found for this type.
            </div>
          </div>
        </template>
      </Card>

      <!-- No object types message -->
      <div v-if="objectTypesWithMethods.length === 0" class="text-gray-500">
        No object types with methods found in the module.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { toRefs } from 'vue'
  import Card from 'primevue/card'
  import Button from 'primevue/button'
  import Tag from 'primevue/tag'
  import InputText from 'primevue/inputtext'
  import Message from 'primevue/message'
  import TypeViewer from './TypeViewer.vue'
  import GlueCodeGenerator from './GlueCodeGenerator.vue'
  import { Module } from '../module'
  import { TypeKind } from '@wa-os/ts-rpc'
  import type { TypeDescription, TypeMember, TypedValue } from '@wa-os/ts-rpc'

  const props = defineProps<{
    module: Module
  }>()

  const { module } = toRefs(props)

  const expandedTypes = ref<Set<string>>(new Set())
  const methodParams = ref<Record<string, string>>({})
  const methodResults = ref<Record<string, unknown>>({})
  const methodErrors = ref<Record<string, string>>({})
  const callingMethods = ref<Record<string, boolean>>({})

  const objectTypesWithMethods = computed(() => {
    if (!module.value?.rpcDescription) {
      return []
    }

    const types = module.value.rpcDescription.getTypes()
    return types.filter(type => {
      // Check if it's an object type
      if (type.kind !== TypeKind.Object) {
        return false
      }

      // Check if it has any methods
      return type.members?.some(member => member.type.kind === TypeKind.Method || member.type.kind === TypeKind.Function) || false
    })
  })

  function getMethods(objectType: TypeDescription): TypeMember[] {
    if (!objectType.members) {
      return []
    }

    return objectType.members.filter(member => member.type.kind === TypeKind.Method || member.type.kind === TypeKind.Function)
  }

  function handleToggleExpand(typeName: string) {
    if (expandedTypes.value.has(typeName)) {
      expandedTypes.value.delete(typeName)
    } else {
      expandedTypes.value.add(typeName)
    }
  }

  function getTypePlaceholder(type: TypeDescription): string {
    const kindMap: Record<TypeKind, string> = {
      [TypeKind.Void]: '',
      [TypeKind.UnsignedInteger]: '0',
      [TypeKind.SignedInteger]: '0',
      [TypeKind.FloatingPoint]: '0.0',
      [TypeKind.Boolean]: 'true',
      [TypeKind.String]: '""',
      [TypeKind.Binary]: 'base64...',
      [TypeKind.Enum]: 'enum value',
      [TypeKind.Array]: '[]',
      [TypeKind.Object]: '{}',
      [TypeKind.DynamicObject]: '{}',
      [TypeKind.Pointer]: 'pointer',
      [TypeKind.Map]: '{}',
      [TypeKind.Function]: 'function',
      [TypeKind.Method]: 'method'
    }
    return kindMap[type.kind] || ''
  }

  function canCallMethod(objectType: TypeDescription, methodMember: TypeMember): boolean {
    // For now, allow calling even without parameters
    // In the future, this could validate required parameters
    return true
  }

  async function callMethod(objectType: TypeDescription, methodMember: TypeMember) {
    const methodKey = `${objectType.name}.${methodMember.name}`
    callingMethods.value[methodKey] = true
    methodErrors.value[methodKey] = ''
    methodResults.value[methodKey] = undefined

    try {
      // TODO: Implement actual RPC call
      // For now, just simulate a call
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Mock result
      methodResults.value[methodKey] = {
        message: 'RPC call not yet implemented',
        objectType: objectType.name,
        method: methodMember.name,
        params: methodMember.type.members?.map((m: TypeMember) => ({
          name: m.name,
          value: methodParams.value[`${objectType.name}.${methodMember.name}.${m.name}`] || ''
        })) || []
      }
    } catch (error) {
      methodErrors.value[methodKey] = error instanceof Error ? error.message : String(error)
    } finally {
      callingMethods.value[methodKey] = false
    }
  }

  function clearMethodResult(objectTypeName: string, methodName: string) {
    const key = `${objectTypeName}.${methodName}`
    delete methodResults.value[key]
    delete methodErrors.value[key]
  }

  function formatResult(result: unknown): string {
    if (result === null || result === undefined) {
      return 'null'
    }
    if (typeof result === 'string') {
      return result
    }
    return JSON.stringify(result, null, 2)
  }

  function getAnnotationKey(annotation: TypedValue): string {
    return annotation._type
  }

  function getAnnotationName(annotation: TypedValue): string {
    return annotation._type.replace('_annotation', '')
  }
</script>

<style scoped></style>
