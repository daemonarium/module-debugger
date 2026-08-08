import {
  CodecRegistry,
  LocalCircularBuffer,
  LocalCircularBufferReader,
  deserializeTypeRegistry,
  deserializeTypedJson,
  ensureRpcCodecs,
  registerDynamicCodecs,
  type TypeRegistry,
} from '@wa-os/ts-rpc'
import {
  type BindingsSnapshotView,
  type RecordingDump,
  type SessionMetaView,
  type SnapshotMetaView,
  num,
  registryKey,
} from './types.js'

/** Basename → file bytes (browser or Node). */
export type SessionFileMap = Map<string, Uint8Array>

function toLabels(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  if (raw instanceof Map) {
    const out: Record<string, string> = {}
    for (const [k, v] of raw.entries()) {
      out[String(k)] = String(v)
    }
    return out
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = String(v)
  }
  return out
}

export function sessionFromRaw(raw: Record<string, unknown>): SessionMetaView {
  return {
    name: String(raw.name ?? ''),
    processId: num(raw.process_id),
    status: String(raw.status ?? ''),
    error: String(raw.error ?? ''),
    labels: toLabels(raw.labels),
  }
}

export function snapshotFromRaw(raw: Record<string, unknown>): SnapshotMetaView {
  return {
    snapshotUid: num(raw.snapshot_uid),
    manaUsed: num(raw.mana_used),
    manaLimit: num(raw.mana_limit),
    memorySize: num(raw.memory_size),
  }
}

export function bindingsFromRaw(raw: Record<string, unknown>): BindingsSnapshotView {
  const list = Array.isArray(raw.bindings) ? raw.bindings : []
  return {
    processId: num(raw.process_id),
    bindings: list.map((b: any) => ({
      socket: num(b.socket),
      peerProcess: num(b.peer_process),
      peerSocket: num(b.peer_socket),
      direction: num(b.direction),
    })),
  }
}

export function deserializeTypedBytes(
  registry: TypeRegistry,
  typeName: string,
  bytes: Uint8Array
): Record<string, unknown> {
  const codecs = new CodecRegistry()
  registerDynamicCodecs(codecs, registry)
  ensureRpcCodecs(codecs, registry)
  const buffer = new LocalCircularBuffer(Math.max(bytes.length + 256, 1024))
  buffer.write(bytes, bytes.length)
  const reader = new LocalCircularBufferReader(buffer, codecs)
  return deserializeTypedJson(reader, registry, typeName) as Record<string, unknown>
}

function requireFile(files: SessionFileMap, name: string): Uint8Array {
  const bytes = files.get(name)
  if (!bytes) {
    throw new Error(`missing session file: ${name}`)
  }
  return bytes
}

/**
 * Build a RecordingDump from in-memory session files (browser-safe).
 * TypeRegistry must include session_meta / snapshot_meta / bindings_snapshot
 * (waosrec.rpc_description.bin fixture works).
 */
export function buildDumpFromSessionFiles(
  files: SessionFileMap,
  typeRegistry: TypeRegistry
): RecordingDump {
  const names = [...files.keys()]
  const snapMetas = names
    .map((n) => /^snap\.(\d+)\.meta\.bin$/.exec(n))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[0], uid: Number(m[1]) }))
  if (snapMetas.length === 0) {
    throw new Error('no snap.<uid>.meta.bin in session files')
  }
  snapMetas.sort((a, b) => b.uid - a.uid)
  const best = snapMetas[0]

  const sessionRaw = deserializeTypedBytes(
    typeRegistry,
    'session_meta',
    requireFile(files, 'meta.bin')
  )
  const anchorRaw = deserializeTypedBytes(
    typeRegistry,
    'snapshot_meta',
    requireFile(files, best.name)
  )

  let bindings: BindingsSnapshotView = { processId: 0, bindings: [] }
  const bindingsBytes = files.get('bindings.bin')
  if (bindingsBytes && bindingsBytes.length > 0) {
    try {
      bindings = bindingsFromRaw(
        deserializeTypedBytes(typeRegistry, 'bindings_snapshot', bindingsBytes)
      )
    } catch {
      /* optional / corrupt */
    }
  }

  const registries = new Map<string, Uint8Array>()
  for (const name of names) {
    const m = /^registry\.(\d+)\.(\d+)\.bin$/.exec(name)
    if (!m) continue
    registries.set(registryKey(Number(m[1]), Number(m[2])), files.get(name)!)
  }

  return {
    formatVersion: 1,
    session: sessionFromRaw(sessionRaw),
    anchor: snapshotFromRaw(anchorRaw),
    code: files.get('code.wasm') ?? new Uint8Array(0),
    memory: requireFile(files, `snap.${best.uid}.bin`),
    events: files.get('io.bin') ?? new Uint8Array(0),
    bindings,
    registries,
  }
}

export function loadWaosrec(bytes: Uint8Array, typeRegistry: TypeRegistry): RecordingDump {
  const raw = deserializeTypedBytes(typeRegistry, 'waosrec_file', bytes)
  const manifest = (raw.manifest ?? {}) as Record<string, unknown>
  const session = sessionFromRaw((manifest.session ?? {}) as Record<string, unknown>)
  const anchor = snapshotFromRaw((manifest.anchor ?? {}) as Record<string, unknown>)
  const bindings = bindingsFromRaw((raw.bindings ?? {}) as Record<string, unknown>)

  const registries = new Map<string, Uint8Array>()
  const list = Array.isArray(raw.registries) ? raw.registries : []
  for (const entry of list as any[]) {
    const pid = num(entry.process_id)
    const sock = num(entry.socket_id)
    const blob = entry.bytes
    const bytesArr = blob instanceof Uint8Array
      ? blob
      : Array.isArray(blob)
        ? Uint8Array.from(blob)
        : new Uint8Array(0)
    registries.set(registryKey(pid, sock), bytesArr)
  }

  const toBin = (v: unknown): Uint8Array => {
    if (v instanceof Uint8Array) return v
    if (Array.isArray(v)) return Uint8Array.from(v as number[])
    return new Uint8Array(0)
  }

  return {
    formatVersion: num(manifest.format_version) || 1,
    session,
    anchor,
    code: toBin(raw.code),
    memory: toBin(raw.memory),
    events: toBin(raw.events),
    bindings,
    registries,
  }
}

/** Load TypeRegistry from a serialized rpc_description blob. */
export function loadTypeRegistryFromBytes(bytes: Uint8Array): TypeRegistry {
  const registry = deserializeTypeRegistry(bytes)
  registry.assignMethodIds()
  return registry
}
