import {
  CodecRegistry,
  LocalCircularBuffer,
  LocalCircularBufferReader,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  registerDynamicCodecs,
  type TypeRegistry,
} from '@wa-os/ts-rpc'
import { registerMessageCodecs } from '@wa-os/ts-rpc/src/valueSerialization.js'
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

/**
 * Attempt to decode length-prefixed socket messages (RPC framing) from a Copy payload.
 * Wire: [u32 LE length][u64 type_index][body…]
 */
export function decodeSocketPayload(
  bytes: Uint8Array,
  typeRegistry: TypeRegistry
): DecodeSocketResult {
  if (!bytes.length) {
    return { ok: false, messages: [], error: 'empty payload' }
  }

  try {
    ensureRpcTypesInRegistry(typeRegistry)
    const codecs = new CodecRegistry()
    registerDynamicCodecs(codecs, typeRegistry)
    registerMessageCodecs(codecs, typeRegistry)
    ensureRpcCodecs(codecs, typeRegistry)
    return decodeLengthPrefixedSync(bytes, codecs)
  } catch (error) {
    return {
      ok: false,
      messages: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function decodeLengthPrefixedSync(
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
