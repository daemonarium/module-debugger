import { loadTypeRegistryFromBytes } from './sessionFiles.js'
import type { TypeRegistry } from '@daemonarium/rpc'

/** Vite resolves `?url` to a served asset URL. */
import waosrecRegistryUrl from '../../fixtures/waosrec.rpc_description.bin?url'

let cachedWaosrecRegistry: TypeRegistry | null = null

/** Fetch and cache the committed waosrec TypeRegistry fixture (browser-safe). */
export async function loadWaosrecTypeRegistry(): Promise<TypeRegistry> {
  if (cachedWaosrecRegistry) return cachedWaosrecRegistry
  const res = await fetch(waosrecRegistryUrl)
  if (!res.ok) {
    throw new Error(`failed to fetch waosrec registry fixture: ${res.status}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  cachedWaosrecRegistry = loadTypeRegistryFromBytes(buf)
  return cachedWaosrecRegistry
}
