import {
  CodecRegistry,
  LocalCircularBuffer,
  LocalCircularBufferReader,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  registerDynamicCodecs,
} from '@wa-os/ts-rpc'
import { registerMessageCodecs } from '@wa-os/ts-rpc/src/valueSerialization.js'
import type {
  BindingsSnapshotView,
  DecodedFrame,
  TopologyBinding,
} from './types.js'
import {
  isDirectionIn,
  isDirectionOut,
  num,
  registryKey,
} from './types.js'
import {
  decodeSocketPayloadWithRegistryBytes,
  resolveRegistryBytes,
} from './decode.js'
import { loadTypeRegistryFromBytes } from './sessionFiles.js'

export type StreamDirection = 'in' | 'out'

export interface MessageByteSpan {
  frameIndex: number
  /** Byte offset within this Copy payload that belongs to the message */
  payloadOffset: number
  length: number
}

export interface StreamMessage {
  id: number
  socket: number
  direction: StreamDirection
  /** Full framed message including u32 length prefix */
  bytes: Uint8Array
  /** Bytes after length prefix (type_index + body) */
  body: Uint8Array
  spans: MessageByteSpan[]
  frameIndices: number[]
  typeName?: string
  header?: unknown
  payloadSize?: number
  decodeError?: string
  registryKey?: string
  incomplete?: boolean
}

export interface ExtractedFramed {
  /** Full frame including length prefix */
  bytes: Uint8Array
}

/**
 * Split a contiguous byte buffer into complete length-prefixed frames.
 * Rest is incomplete trailing bytes (may be empty).
 */
export function extractCompleteMessages(buffer: Uint8Array): {
  messages: ExtractedFramed[]
  rest: Uint8Array
} {
  const messages: ExtractedFramed[] = []
  let offset = 0
  while (offset + 4 <= buffer.length) {
    const msgLen = new DataView(
      buffer.buffer,
      buffer.byteOffset + offset,
      4
    ).getUint32(0, true)
    const total = 4 + msgLen
    if (offset + total > buffer.length) break
    messages.push({ bytes: buffer.subarray(offset, offset + total) })
    offset += total
  }
  return {
    messages,
    rest: offset === 0 ? buffer : buffer.subarray(offset),
  }
}

interface BufferChunk {
  frameIndex: number
  payloadOffset: number
  data: Uint8Array
}

interface ChannelState {
  chunks: BufferChunk[]
  /** Total buffered bytes */
  length: number
}

function channelKey(socket: number, dir: StreamDirection): string {
  return `${socket}:${dir}`
}

function appendChunk(ch: ChannelState, frameIndex: number, data: Uint8Array) {
  if (!data.length) return
  ch.chunks.push({ frameIndex, payloadOffset: 0, data })
  ch.length += data.length
}

function peekU32LE(ch: ChannelState): number | undefined {
  if (ch.length < 4) return undefined
  const tmp = new Uint8Array(4)
  let need = 4
  let dest = 0
  for (const c of ch.chunks) {
    const take = Math.min(need, c.data.length)
    tmp.set(c.data.subarray(0, take), dest)
    dest += take
    need -= take
    if (need === 0) break
  }
  return new DataView(tmp.buffer).getUint32(0, true)
}

/** Consume `n` bytes from the front; return them and MessageByteSpan coverage. */
function takeBytes(
  ch: ChannelState,
  n: number
): { bytes: Uint8Array; spans: MessageByteSpan[] } {
  if (n > ch.length) {
    throw new Error(`takeBytes: need ${n}, have ${ch.length}`)
  }
  const bytes = new Uint8Array(n)
  const spans: MessageByteSpan[] = []
  let written = 0
  while (written < n) {
    const chunk = ch.chunks[0]!
    const need = n - written
    const take = Math.min(need, chunk.data.length)
    bytes.set(chunk.data.subarray(0, take), written)
    spans.push({
      frameIndex: chunk.frameIndex,
      payloadOffset: chunk.payloadOffset,
      length: take,
    })
    written += take
    if (take === chunk.data.length) {
      ch.chunks.shift()
    } else {
      chunk.data = chunk.data.subarray(take)
      chunk.payloadOffset += take
    }
  }
  ch.length -= n
  return { bytes, spans: mergeAdjacentSpans(spans) }
}

function mergeAdjacentSpans(spans: MessageByteSpan[]): MessageByteSpan[] {
  if (spans.length === 0) return spans
  const out: MessageByteSpan[] = [{ ...spans[0]! }]
  for (let i = 1; i < spans.length; i++) {
    const prev = out[out.length - 1]!
    const cur = spans[i]!
    if (
      cur.frameIndex === prev.frameIndex &&
      cur.payloadOffset === prev.payloadOffset + prev.length
    ) {
      prev.length += cur.length
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function uniqueSortedFrameIndices(spans: MessageByteSpan[]): number[] {
  return [...new Set(spans.map((s) => s.frameIndex))].sort((a, b) => a - b)
}

function decodeOneFramedMessage(
  framed: Uint8Array,
  registryBytes: Uint8Array | undefined
): Pick<
  StreamMessage,
  'typeName' | 'header' | 'payloadSize' | 'decodeError'
> {
  if (!registryBytes || registryBytes.length === 0) {
    return { decodeError: 'no registry for this socket — hex only' }
  }
  const result = decodeSocketPayloadWithRegistryBytes(framed, registryBytes)
  if (result.messages.length >= 1) {
    const m = result.messages[0]!
    return {
      typeName: m.typeName,
      header: m.header,
      payloadSize: m.payloadSize,
      decodeError: result.ok ? undefined : result.error,
    }
  }
  return {
    decodeError: result.error ?? 'failed to decode message',
  }
}

function applyTopologyFrame(
  topology: Map<number, TopologyBinding>,
  registries: Map<string, Uint8Array>,
  frame: DecodedFrame
): void {
  if (frame.typeName === 'process_bind_event') {
    const socket = num(frame.header.socket)
    const peerProcess = num(frame.header.peer_process)
    const peerSocket = num(frame.header.peer_socket)
    const dir = num(frame.header.direction)
    topology.set(socket, {
      peerProcess,
      peerSocket,
      direction: dir,
    })
    const key = registryKey(peerProcess, peerSocket)
    if (!registries.has(key)) {
      registries.set(key, new Uint8Array(0))
    }
    return
  }
  if (frame.typeName === 'process_unbind_event') {
    topology.delete(num(frame.header.socket))
  }
}

function drainCompleteMessages(
  ch: ChannelState,
  socket: number,
  direction: StreamDirection,
  processId: number,
  topology: Map<number, TopologyBinding>,
  registries: Map<string, Uint8Array>,
  nextId: () => number,
  out: StreamMessage[]
): void {
  for (;;) {
    if (ch.length < 4) break
    const msgLen = peekU32LE(ch)
    if (msgLen === undefined) break
    const total = 4 + msgLen
    if (ch.length < total) break

    const { bytes, spans } = takeBytes(ch, total)
    const body = bytes.subarray(4)
    const resolved = resolveRegistryBytes(socket, processId, topology, registries)
    const decoded = decodeOneFramedMessage(bytes, resolved.bytes)
    out.push({
      id: nextId(),
      socket,
      direction,
      bytes,
      body,
      spans,
      frameIndices: uniqueSortedFrameIndices(spans),
      registryKey: resolved.key,
      ...decoded,
    })
  }
}

/**
 * Build logical RPC message stream from monitor frames by reassembling
 * length-prefixed messages across process_copy_event payloads (per socket + direction).
 */
export function buildMessageStream(
  frames: DecodedFrame[],
  processId: number,
  bindings: BindingsSnapshotView,
  registriesInput: Map<string, Uint8Array>
): StreamMessage[] {
  const topology = new Map<number, TopologyBinding>()
  for (const b of bindings.bindings) {
    topology.set(b.socket, {
      peerProcess: b.peerProcess,
      peerSocket: b.peerSocket,
      direction: b.direction,
    })
  }
  const registries = new Map(registriesInput)
  const channels = new Map<string, ChannelState>()
  const out: StreamMessage[] = []
  let idSeq = 0
  const nextId = () => idSeq++

  const getChannel = (socket: number, dir: StreamDirection): ChannelState => {
    const key = channelKey(socket, dir)
    let ch = channels.get(key)
    if (!ch) {
      ch = { chunks: [], length: 0 }
      channels.set(key, ch)
    }
    return ch
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!
    if (
      frame.typeName === 'process_bind_event' ||
      frame.typeName === 'process_unbind_event'
    ) {
      applyTopologyFrame(topology, registries, frame)
      continue
    }
    if (frame.typeName !== 'process_copy_event' || frame.payload.length === 0) {
      continue
    }
    const dirRaw = frame.header.direction
    let direction: StreamDirection | undefined
    if (isDirectionIn(dirRaw)) direction = 'in'
    else if (isDirectionOut(dirRaw)) direction = 'out'
    else continue

    const socket = num(frame.header.socket)
    const ch = getChannel(socket, direction)
    appendChunk(ch, i, frame.payload)
    drainCompleteMessages(
      ch,
      socket,
      direction,
      processId,
      topology,
      registries,
      nextId,
      out
    )
  }

  // Incomplete tails
  for (const [key, ch] of channels) {
    if (ch.length === 0) continue
    const { bytes, spans } = takeBytes(ch, ch.length)
    const [sockStr, dirStr] = key.split(':')
    out.push({
      id: nextId(),
      socket: Number(sockStr),
      direction: dirStr as StreamDirection,
      bytes,
      body: bytes.length > 4 ? bytes.subarray(4) : new Uint8Array(0),
      spans,
      frameIndices: uniqueSortedFrameIndices(spans),
      incomplete: true,
      decodeError: 'incomplete message (truncated stream)',
    })
  }

  return out
}

/** Decode helpers kept for tests that need codecs setup without stream. */
export function codecsFromRegistryBytes(registryBytes: Uint8Array): CodecRegistry {
  const typeRegistry = loadTypeRegistryFromBytes(registryBytes)
  ensureRpcTypesInRegistry(typeRegistry)
  const codecs = new CodecRegistry()
  registerDynamicCodecs(codecs, typeRegistry)
  registerMessageCodecs(codecs, typeRegistry)
  ensureRpcCodecs(codecs, typeRegistry)
  return codecs
}

export function readFramedBody(
  framed: Uint8Array,
  codecs: CodecRegistry
): { typeName: string; header: unknown; payloadSize: number } {
  const msgLen = new DataView(
    framed.buffer,
    framed.byteOffset,
    4
  ).getUint32(0, true)
  const slice = framed.subarray(4, 4 + msgLen)
  const buffer = new LocalCircularBuffer(Math.max(slice.length + 64, 256))
  buffer.write(slice, slice.length)
  const reader = new LocalCircularBufferReader(buffer, codecs)
  const typeIndex = Number(reader.readU64())
  const codec = codecs.messages.getByIndex(typeIndex)
  let header: unknown
  codec.deserialize(reader as any, (v: unknown) => {
    header = v
  })
  const headerEnd = reader.getReadOffset()
  reader.readRest()
  return {
    typeName: codec.name,
    header,
    payloadSize: Math.max(0, msgLen - headerEnd),
  }
}
