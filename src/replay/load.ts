import fsp from 'node:fs/promises'
import { join } from 'node:path'
import type { TypeRegistry } from '@daemonarium/rpc'
import type { RecordingDump } from './types.js'
import {
  buildDumpFromSessionFiles,
  type SessionFileMap,
} from './sessionFiles.js'

export {
  buildDumpFromSessionFiles,
  loadWaosrec,
  loadTypeRegistryFromBytes,
  deserializeTypedBytes,
  type SessionFileMap,
} from './sessionFiles.js'

/**
 * Load a debug-store session directory (Node only).
 * Browser UI should use buildDumpFromSessionFiles with a SessionFileMap.
 */
export async function loadSessionDir(
  dir: string,
  typeRegistry: TypeRegistry
): Promise<RecordingDump> {
  const names = await fsp.readdir(dir)
  const files: SessionFileMap = new Map()
  for (const name of names) {
    files.set(name, new Uint8Array(await fsp.readFile(join(dir, name))))
  }
  return buildDumpFromSessionFiles(files, typeRegistry)
}
