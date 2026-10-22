<template>
  <div class="type-viewer" :class="{ 'py-1': !compact }">
    <div class="flex items-center gap-2">
      <Button
        v-if="hasExpandableContent && !compact"
        :icon="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
        text
        rounded
        size="small"
        @click="toggleExpand"
        class="p-0 w-4 h-4"
      />
      <span class="font-mono text-sm">
        <span class="font-semibold" :class="{ 'text-xs': compact }">{{ compactText }}</span>
        <span v-if="showKind && typeKind && !compact" class="text-gray-500 ml-1">({{ typeKind }})</span>
      </span>
      <Tag
        v-if="!compact"
        v-for="annotation in typeAnnotations"
        :key="getAnnotationKey(annotation)"
        :value="getAnnotationName(annotation)"
        severity="info"
        class="ml-1"
      />
    </div>
    
    <div v-if="expanded && hasExpandableContent && !compact" class="ml-6 mt-2 space-y-2">
      <!-- Enum members -->
      <div v-if="type.enumMembers && type.enumMembers.length > 0" class="ml-4">
        <div class="text-xs text-gray-500 mb-1">Enum values:</div>
        <div v-for="member in type.enumMembers" :key="member.name" class="ml-4 text-sm">
          <span class="font-mono">{{ member.name }}</span>
          <span class="text-gray-500 ml-2">= {{ member.value.toString() }}</span>
        </div>
      </div>

      <!-- Object members -->
      <div v-if="type.members && type.members.length > 0" class="ml-4">
        <div class="text-xs text-gray-500 mb-1">Members:</div>
        <div v-for="member in type.members" :key="member.name" class="ml-4 mb-2">
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm font-semibold">{{ member.name }}</span>
            <Tag
              v-for="annotation in member.annotations"
              :key="getAnnotationKey(annotation)"
              :value="getAnnotationName(annotation)"
              severity="secondary"
              class="text-xs"
            />
            <span class="text-gray-500 text-xs">:</span>  
          </div>
          <TypeViewer
            :type="member.type"
            :registry="registry"
            :expanded-types="expandedTypes"
            @toggle-expand="handleToggleExpand"
            class="ml-4 mt-1"
          />
        </div>
      </div>

      <!-- Item type (for arrays, maps, etc.) -->
      <div v-if="type.item" class="ml-4">
        <div class="text-xs text-gray-500 mb-1">Item type:</div>
        <TypeViewer
          :type="type.item"
          :registry="registry"
          :expanded-types="expandedTypes"
          @toggle-expand="handleToggleExpand"
          class="ml-4"
        />
      </div>

      <!-- Key type (for maps) -->
      <div v-if="type.key" class="ml-4">
        <div class="text-xs text-gray-500 mb-1">Key type:</div>
        <TypeViewer
          :type="type.key"
          :registry="registry"
          :expanded-types="expandedTypes"
          @toggle-expand="handleToggleExpand"
          class="ml-4"
        />
      </div>

      <!-- Base types -->
      <div v-if="type.bases && type.bases.length > 0" class="ml-4">
        <div class="text-xs text-gray-500 mb-1">Bases:</div>
        <TypeViewer
          v-for="(base, index) in type.bases"
          :key="index"
          :type="base"
          :registry="registry"
          :expanded-types="expandedTypes"
          @toggle-expand="handleToggleExpand"
          class="ml-4"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import Button from 'primevue/button'
  import Tag from 'primevue/tag'
  import type { TypeDescription, TypeRegistry, TypedValue } from '@daemonarium/rpc'
  import { TypeKind } from '@daemonarium/rpc'
  import { formatTypeShort } from './recording/formatTypeShort.js'

  const props = withDefaults(defineProps<{
    type: TypeDescription
    registry: TypeRegistry
    expandedTypes?: Set<string>
    compact?: boolean
    showKind?: boolean
  }>(), {
    compact: false,
    showKind: true,
  })

  const emit = defineEmits<{
    toggleExpand: [typeName: string]
  }>()

  const expandedTypesSet = computed(() => props.expandedTypes || new Set<string>())
  const expanded = computed(() => expandedTypesSet.value.has(props.type.name))

  const typeName = computed(() => props.type.name)
  const compactText = computed(() => props.compact ? formatTypeShort(props.type) : typeName.value)

  function toggleExpand() {
    emit('toggleExpand', props.type.name)
  }
  
  const typeKind = computed(() => {
    const kindMap: Record<TypeKind, string> = {
      [TypeKind.Void]: 'void',
      [TypeKind.Boolean]: 'bool',
      [TypeKind.UnsignedInteger8]: 'u8',
      [TypeKind.SignedInteger8]: 'i8',
      [TypeKind.UnsignedInteger16]: 'u16',
      [TypeKind.SignedInteger16]: 'i16',
      [TypeKind.UnsignedInteger32]: 'u32',
      [TypeKind.SignedInteger32]: 'i32',
      [TypeKind.UnsignedInteger64]: 'u64',
      [TypeKind.SignedInteger64]: 'i64',
      [TypeKind.FloatingPoint32]: 'f32',
      [TypeKind.FloatingPoint64]: 'f64',
      [TypeKind.Enum]: 'enum',
      [TypeKind.Array]: 'array',
      [TypeKind.String]: 'string',
      [TypeKind.Binary]: 'binary',
      [TypeKind.Map]: 'map',
      [TypeKind.Object]: 'object',
      [TypeKind.DynamicObject]: 'dynamic',
      [TypeKind.Message]: 'message',
      [TypeKind.Exception]: 'exception',
      [TypeKind.Pointer]: 'pointer',
      [TypeKind.Function]: 'function',
      [TypeKind.Method]: 'method'
    }
    return kindMap[props.type.kind] || 'unknown'
  })

  const typeAnnotations = computed(() => props.type.annotations || [])

  const isSimpleType = computed(() => {
    const simpleKinds = [
      TypeKind.Void,
      TypeKind.Boolean,
      TypeKind.UnsignedInteger8,
      TypeKind.SignedInteger8,
      TypeKind.UnsignedInteger16,
      TypeKind.SignedInteger16,
      TypeKind.UnsignedInteger32,
      TypeKind.SignedInteger32,
      TypeKind.UnsignedInteger64,
      TypeKind.SignedInteger64,
      TypeKind.FloatingPoint32,
      TypeKind.FloatingPoint64,
      TypeKind.String,
      TypeKind.Binary,
      TypeKind.Pointer
    ]
    return simpleKinds.includes(props.type.kind)
  })

  const hasExpandableContent = computed(() => {
    // Don't show expand button for simple types
    if (isSimpleType.value) {
      return false
    }
    
    return (
      (props.type.members && props.type.members.length > 0) ||
      (props.type.enumMembers && props.type.enumMembers.length > 0) ||
      props.type.item !== undefined ||
      props.type.key !== undefined ||
      (props.type.bases && props.type.bases.length > 0)
    )
  })

  function handleToggleExpand(typeName: string) {
    emit('toggleExpand', typeName)
  }

  function getAnnotationKey(annotation: TypedValue): string {
    return annotation._type
  }

  function getAnnotationName(annotation: TypedValue): string {
    return annotation._type.replace('_annotation', '')
  }
</script>

