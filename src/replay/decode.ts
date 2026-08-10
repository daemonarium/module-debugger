import {
  CodecRegistry,
  LocalCircularBuffer,
  LocalCircularBufferReader,
  FlatLocalCircularBufferReader,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  registerDynamicCodecs,
  type TypeRegistry,
  registerMessageCodecs,
  SerializationFormat,
  tryUnpackSerializationFormatEnvelope,
} from '@wa-os/ts-rpc'
import type { TopologyBinding } from './types.js'
import { registryKey } from './types.js'
import { loadTypeRegistryFromBytes } from './sessionFiles.js'

export interface DecodedSocketMessage {
  typeName: string
  header: unknown
  payloadSize: number
}

export interface DecodeSocketResult {
  ok: boolean
  messages: DecodedSocketMessage[]
  error?: string
  registryKey?: string
  unsupportedFormat?: 'key'
  dataFormat?: SerializationFormat
  formatConflict?: boolean
}

/**
 * Resolve registry blob for a local socket using topology (peer) or target pid.socket.
 */
export function resolveRegistryBytes(
  localSocket: number,
  processId: number,
  topology: Map<number, TopologyBinding>,
  registries: Map<string, Uint8Array>
): { key: string; bytes: Uint8Array | undefined } {
  const peer = topology.get(localSocket)
  if (peer) {
    const key = registryKey(peer.peerProcess, peer.peerSocket)
    const bytes = registries.get(key)
    if (bytes && bytes.length > 0) {
      return { key, bytes }
    }
  }
  const key = registryKey(processId, localSocket)
  return { key, bytes: registries.get(key) }
}

/** Peek data format from a registry blob (envelope or legacy → compressed). */
export function peekRegistryDataFormat(bytes: Uint8Array): SerializationFormat {
  if (bytes.length === 0) {
    return SerializationFormat.Compressed
  }
  const unpacked = tryUnpackSerializationFormatEnvelope(bytes[0]!)
  if (unpacked !== null) {
    return unpacked
  }
  return SerializationFormat.Compressed
}

/**
 * Resolve data format for a connection from local and/or peer registry blobs.
 * Prefer peer when both present; flag conflict when formats differ.
 */
export function resolveConnectionDataFormat(
  localBytes?: Uint8Array,
  peerBytes?: Uint8Array
): {
  format: SerializationFormat
  conflict: boolean
  source: 'peer' | 'local' | 'default'
} {
  const hasPeer = !!(peerBytes && peerBytes.length > 0)
  const hasLocal = !!(localBytes && localBytes.length > 0)
  const peerFmt = hasPeer ? peekRegistryDataFormat(peerBytes!) : null
  const localFmt = hasLocal ? peekRegistryDataFormat(localBytes!) : null

  if (peerFmt !== null && localFmt !== null) {
    if (peerFmt !== localFmt) {
      return { format: peerFmt, conflict: true, source: 'peer' }
    }
    return { format: peerFmt, conflict: false, source: 'peer' }
  }
  if (peerFmt !== null) {
    return { format: peerFmt, conflict: false, source: 'peer' }
  }
  if (localFmt !== null) {
    return { format: localFmt, conflict: false, source: 'local' }
  }
  return { format: SerializationFormat.Compressed, conflict: false, source: 'default' }
}

/**
 * Attempt to decode length-prefixed socket messages from a Copy payload.
 * Branch on typeRegistry.dataFormat (compressed / flat / key).
 */
export function decodeSocketPayload(
  bytes: Uint8Array,
  typeRegistry: TypeRegistry
): DecodeSocketResult {
  if (!bytes.length) {
    return { ok: false, messages: [], error: 'empty payload' }
  }

  const dataFormat = typeRegistry.dataFormat ?? SerializationFormat.Compressed
  if (dataFormat === SerializationFormat.Key) {
    return {
      ok: false,
      messages: [],
      error: 'key format is not a length-prefixed RPC stream (index/DB keys)',
      unsupportedFormat: 'key',
      dataFormat,
    }
  }

  try {
    ensureRpcTypesInRegistry(typeRegistry)
    const codecs = new CodecRegistry()
    registerDynamicCodecs(codecs, typeRegistry)
    registerMessageCodecs(codecs, typeRegistry)
    ensureRpcCodecs(codecs, typeRegistry)
    if (dataFormat === SerializationFormat.Flat) {
      return { ...decodeLengthPrefixedFlat(bytes, codecs), dataFormat }
    }
    return { ...decodeLengthPrefixedCompressed(bytes, codecs), dataFormat }
  } catch (error) {
    return {
      ok: false,
      messages: [],
      error: error instanceof Error ? error.message : String(error),
      dataFormat,
    }
  }
}

function decodeLengthPrefixedCompressed(
  bytes: Uint8Array,
  codecs: CodecRegistry
): DecodeSocketResult {
  const messages: DecodedSocketMessage[] = []
  let offset = 0
  try {
    while (offset + 4 <= bytes.length) {
      const msgLen = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset,
        4
      ).getUint32(0, true)
      offset += 4
      if (offset + msgLen > bytes.length) {
        return {
          ok: messages.length > 0,
          messages,
          error: messages.length
            ? `truncated after ${messages.length} message(s)`
            : `truncated message (need ${msgLen} bytes)`,
        }
      }
      const slice = bytes.subarray(offset, offset + msgLen)
      offset += msgLen

      const buffer = new LocalCircularBuffer(Math.max(slice.length + 64, 256))
      buffer.write(slice, slice.length)
      const reader = new LocalCircularBufferReader(buffer, codecs)
      const typeIndex = Number(reader.readU64())
      let codec
      try {
        codec = codecs.messages.getByIndex(typeIndex)
      } catch {
        return {
          ok: false,
          messages,
          error: `unknown message type index ${typeIndex}`,
        }
      }
      let header: unknown
      codec.deserialize(reader as any, (v: unknown) => {
        header = v
      })
      const headerEnd = reader.getReadOffset()
      reader.readRest()
      const payloadSize = Math.max(0, msgLen - headerEnd)
      messages.push({
        typeName: codec.name,
        header,
        payloadSize,
      })
    }
    if (offset < bytes.length) {
      return {
        ok: messages.length > 0,
        messages,
        error: `trailing ${bytes.length - offset} byte(s) after messages`,
      }
    }
    if (messages.length === 0) {
      return { ok: false, messages: [], error: 'not length-prefixed RPC (no frames)' }
    }
    return { ok: true, messages }
  } catch (error) {
    return {
      ok: false,
      messages,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function decodeLengthPrefixedFlat(
  bytes: Uint8Array,
  codecs: CodecRegistry
): DecodeSocketResult {
  const messages: DecodedSocketMessage[] = []
  let offset = 0
  try {
    while (offset + 4 <= bytes.length) {
      const msgLen = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset,
        4
      ).getUint32(0, true)
      offset += 4
      if (offset + msgLen > bytes.length) {
        return {
          ok: messages.length > 0,
          messages,
          error: messages.length
            ? `truncated after ${messages.length} message(s)`
            : `truncated message (need ${msgLen} bytes)`,
        }
      }
      const slice = bytes.subarray(offset, offset + msgLen)
      offset += msgLen

      const buffer = new LocalCircularBuffer(Math.max(slice.length + 64, 256))
      buffer.write(slice, slice.length)
      const reader = new FlatLocalCircularBufferReader(buffer, codecs)
      reader.setReadOffset(0)
      const typeIndex = reader.readU32()
      reader.readU32() // encoded_size_0
      let codec
      try {
        codec = codecs.messages.getByIndex(typeIndex)
      } catch {
        return {
          ok: false,
          messages,
          error: `unknown message type index ${typeIndex}`,
        }
      }
      let header: unknown
      codec.deserialize(reader as any, (v: unknown) => {
        header = v
      })
      reader.readRest()
      const sentinel = reader.readU32()
      if (sentinel !== 0) {
        return {
          ok: false,
          messages,
          error: `flat codec: expected frame sentinel, got ${sentinel}`,
        }
      }
      const payloadSize = Math.max(0, msgLen - reader.getReadOffset())
      messages.push({
        typeName: codec.name,
        header,
        payloadSize,
      })
    }
    if (offset < bytes.length) {
      return {
        ok: messages.length > 0,
        messages,
        error: `trailing ${bytes.length - offset} byte(s) after messages`,
      }
    }
    if (messages.length === 0) {
      return { ok: false, messages: [], error: 'not length-prefixed RPC (no frames)' }
    }
    return { ok: true, messages }
  } catch (error) {
    return {
      ok: false,
      messages,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Decode using registry blob bytes (loads TypeRegistry first). */
export function decodeSocketPayloadWithRegistryBytes(
  bytes: Uint8Array,
  registryBytes: Uint8Array
): DecodeSocketResult {
  if (!registryBytes.length) {
    return { ok: false, messages: [], error: 'registry missing or empty' }
  }
  try {
    const registry = loadTypeRegistryFromBytes(registryBytes)
    return decodeSocketPayload(bytes, registry)
  } catch (error) {
    return {
      ok: false,
      messages: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
