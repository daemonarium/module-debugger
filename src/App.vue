<template>
  <div>
    <ModuleSource v-if="!wasmModule" v-model="wasmModule" />
    
  </div>
</template>

<script setup lang="ts">
  import { shallowRef, ref, watch } from 'vue'
  import ModuleSource from './components/ModuleSource.vue'
  import { Module } from './module'
  import { 
    TypeRegistry, Reader, CodecRegistry, typeRegistrySerializationRegistry, deserializeTypedJson,
    registerDynamicCodecs 
  } from '@wa-os/ts-rpc'

  const wasmModule = shallowRef<WebAssembly.Module | null>(null)

  const module = shallowRef<Module | null>(null)

  const rpcDescriptionBuffer = shallowRef<Uint8Array | null>(null)
  const rpcDescription = shallowRef<TypeRegistry | null>(null)

  watch(wasmModule, async (newWasmModule) => {
    if (newWasmModule) {
      console.log('module', newWasmModule)
      const m = new Module(newWasmModule)
      await m.instantiate()
      //@ts-ignore
      globalThis.module = m

      try {
        rpcDescriptionBuffer.value = m.getRpcDescription()
        console.log('rpcDescriptionBuffer', rpcDescriptionBuffer.value)
        
        // create download of registry buffer as binary file
        // @ts-ignore
        /* const blob = new Blob([rpcDescriptionBuffer.value], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'registry.bin'
        a.click()
        URL.revokeObjectURL(url) */

      //  rpcDescription.value = TypeRegistry.deserialize(new Reader(rpcDescriptionBuffer.value, new CodecRegistry()))

        const registry = typeRegistrySerializationRegistry()
        const reader = new Reader(rpcDescriptionBuffer.value, new CodecRegistry())       
        registerDynamicCodecs(reader.codecs, registry)
        const rpcDescription = deserializeTypedJson(reader, registry, 'type_registry')

        console.log('rpcDescription', rpcDescription)

      } catch (error) {
        console.error('Failed to get rpc description', error)
      }
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
  /* @supports (font-variation-settings: normal) {
    :root { font-family: 'Verdana var', sans-serif; }
  } */
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
