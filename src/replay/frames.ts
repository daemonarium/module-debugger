import {
  LocalCircularBuffer,
  FlatLocalCircularBufferReader,
  FlatLocalCircularBufferWriter,
  LocalCircularBufferReader,
  TypeKind,
  SerializationFormat,
  type TypeRegistry,
} from '@wa-os/ts-rpc'
import { CodecRegistry } from '@wa-os/ts-rpc'
import {
  registerDynamicCodecs,
  serializeValueByType,
  deserializeValueByType,
  type JsonValue,
} from '@wa-os/ts-rpc'
import { createGeneratedTypeRegistry } from '@wa-os/ts-kernel/src/kernelApi.js'
import {
  type DecodedFrame,
  type FrameClass,
  isDirectionIn,
  isDirectionOut,
} from './types.js'

const LENGTH_SIZE = 4

export interface MonitorCodecs {
  registry: TypeRegistry
  codecs: CodecRegistry
}

export function createMonitorCodecs(): MonitorCodecs {
  const { registry } = createGeneratedTypeRegistry()
  const codecs = new CodecRegistry()
  registerDynamicCodecs(codecs as any, registry as any)
  for (const type of registry.getTypes()) {
    if (type.kind === TypeKind.Message) {
      codecs.messages.register({
        name: type.name,
        serialize: (writer, value) =>
          serializeValueByType(writer as any, registry as any, type, value as JsonValue),
        deserialize: (reader, output) =>
          deserializeValueByType(reader as any, registry as any, type, output),
      })
    }
  }
  return { registry, codecs }
}

export function classifyFrame(typeName: string, header: Record<string, unknown>): FrameClass {
  switch (typeName) {
    case 'process_copy_event':
      if (isDirectionOut(header.direction)) return 'expect'
      if (isDirectionIn(header.direction)) return 'stimulus'
      return 'ignore'
    case 'process_data_event':
      return isDirectionIn(header.direction) ? 'stimulus' : 'ignore'
    case 'process_drain_event':
      return isDirectionOut(header.direction) ? 'stimulus' : 'ignore'
    case 'process_measure_mana_event':
    case 'process_set_mana_limit_event':
      return 'stimulus'
    case 'process_bind_event':
    case 'process_unbind_event':
      return 'topology'
    case 'process_save_event':
    case 'process_error_event':
    case 'process_killed_event':
      return 'anchor'
    default:
      return 'ignore'
  }
}

function buildFrameWithWriter(
  codecs: CodecRegistry,
  typeName: string,
  header: object,
  trailingPayload?: Uint8Array
): Uint8Array {
  const wireIndex = codecs.messages.getIndexOrThrow(typeName)
  const trailingSize = trailingPayload?.length ?? 0
  const tempBuffer = new LocalCircularBuffer(Math.max(256, trailingSize + 256))
  const writer = new FlatLocalCircularBufferWriter(tempBuffer, codecs as any, LENGTH_SIZE)

  writer.writeU32(wireIndex)
  const sizePlaceholder = writer.getOffset()
  writer.writeU32(0)
  const frameStart = writer.getOffset()

  const codec = codecs.messages.getByIndex(wireIndex)
  codec.serialize(writer as any, header)

  const realSize = writer.getOffset() - frameStart
  writer.pokeU32(sizePlaceholder, realSize + 1)
  writer.writeRest()
  writer.writeU32(0) // sentinel

  if (trailingPayload && trailingSize > 0) {
    tempBuffer.poke(writer.offset, trailingPayload, trailingSize)
  }
  const payloadLen = writer.offset - LENGTH_SIZE + trailingSize
  const lengthBytes = new Uint8Array(LENGTH_SIZE)
  new DataView(lengthBytes.buffer).setUint32(0, payloadLen, true)
  tempBuffer.poke(0, lengthBytes, LENGTH_SIZE)
  tempBuffer.commitWrite(writer.offset + trailingSize)
  const readable = tempBuffer.readableBytes()
  const out = new Uint8Array(readable)
  tempBuffer.read(out, readable)
  return out
}

/** Encode a length-prefixed flat monitor frame (tests / fixtures). */
export function encodeMonitorFrame(
  typeName: string,
  header: object,
  trailingPayload?: Uint8Array
): Uint8Array {
  const { codecs } = createMonitorCodecs()
  return buildFrameWithWriter(codecs, typeName, header, trailingPayload)
}

export interface ParseMonitorFramesOptions {
  codecs?: CodecRegistry
  /**
   * Wire format of io.bin frames. Default flat (current kernel emitter).
   * Pass Compressed for legacy recordings / fixtures.
   */
  format?: SerializationFormat
}

function parseMonitorFramesFlat(
  events: Uint8Array,
  resolved: CodecRegistry
): DecodedFrame[] {
  const buffer = new LocalCircularBuffer(Math.max(events.length + 64, 256))
  buffer.write(events, events.length)
  const frames: DecodedFrame[] = []
  let absoluteOffset = 0

  while (buffer.readableBytes() >= LENGTH_SIZE) {
    const lengthBytes = new Uint8Array(LENGTH_SIZE)
    buffer.peek(0, lengthBytes, LENGTH_SIZE)
    const msgLen = new DataView(lengthBytes.buffer, lengthBytes.byteOffset, LENGTH_SIZE).getUint32(0, true)
    if (buffer.readableBytes() < LENGTH_SIZE + msgLen) {
      break
    }

    const frameOffset = absoluteOffset
    buffer.skipRead(LENGTH_SIZE)
    absoluteOffset += LENGTH_SIZE

    const body = new Uint8Array(msgLen)
    buffer.peek(0, body, msgLen)

    const bodyBuffer = new LocalCircularBuffer(Math.max(msgLen + 64, 128))
    bodyBuffer.write(body, msgLen)
    const reader = new FlatLocalCircularBufferReader(bodyBuffer, resolved)
    reader.setReadOffset(0)
    const typeIndex = reader.readU32()
    reader.readU32() // encoded_size_0
    const codec = resolved.messages.getByIndex(typeIndex)
    let header: Record<string, unknown> = {}
    codec.deserialize(reader as any, (value: unknown) => {
      header = value as Record<string, unknown>
    })
    reader.readRest()
    const sentinel = reader.readU32()
    if (sentinel !== 0) {
      throw new Error(`flat monitor frame: expected sentinel 0, got ${sentinel}`)
    }
    const headerEnd = reader.getReadOffset()
    const payloadSize = msgLen - headerEnd
    const payload = payloadSize > 0 ? body.subarray(headerEnd, msgLen) : new Uint8Array(0)

    buffer.skipRead(msgLen)
    absoluteOffset += msgLen

    frames.push({
      typeName: codec.name,
      header,
      payload: new Uint8Array(payload),
      offset: frameOffset,
      class: classifyFrame(codec.name, header),
    })
  }

  return frames
}

/** Legacy compressed monitor framing (pre-flat cutover recordings). */
function parseMonitorFramesCompressed(
  events: Uint8Array,
  resolved: CodecRegistry
): DecodedFrame[] {
  const buffer = new LocalCircularBuffer(Math.max(events.length + 64, 256))
  buffer.write(events, events.length)
  const frames: DecodedFrame[] = []
  let absoluteOffset = 0

  while (buffer.readableBytes() >= LENGTH_SIZE) {
    const lengthBytes = new Uint8Array(LENGTH_SIZE)
    buffer.peek(0, lengthBytes, LENGTH_SIZE)
    const msgLen = new DataView(lengthBytes.buffer, lengthBytes.byteOffset, LENGTH_SIZE).getUint32(0, true)
    if (buffer.readableBytes() < LENGTH_SIZE + msgLen) {
      break
    }

    const frameOffset = absoluteOffset
    buffer.skipRead(LENGTH_SIZE)
    absoluteOffset += LENGTH_SIZE

    const body = new Uint8Array(msgLen)
    buffer.peek(0, body, msgLen)

    const bodyBuffer = new LocalCircularBuffer(Math.max(msgLen + 64, 128))
    bodyBuffer.write(body, msgLen)
    const reader = new LocalCircularBufferReader(bodyBuffer, resolved)
    reader.setReadOffset(0)
    const typeIndex = Number(reader.readU64())
    const codec = resolved.messages.getByIndex(typeIndex)
    let header: Record<string, unknown> = {}
    codec.deserialize(reader as any, (value: unknown) => {
      header = value as Record<string, unknown>
    })
    const headerEnd = reader.getReadOffset()
    reader.readRest()
    const payloadSize = msgLen - headerEnd
    const payload = payloadSize > 0 ? body.subarray(headerEnd, msgLen) : new Uint8Array(0)

    buffer.skipRead(msgLen)
    absoluteOffset += msgLen

    frames.push({
      typeName: codec.name,
      header,
      payload: new Uint8Array(payload),
      offset: frameOffset,
      class: classifyFrame(codec.name, header),
    })
  }

  return frames
}

function isCodecRegistry(value: unknown): value is CodecRegistry {
  return !!value && typeof value === 'object' && 'messages' in value
}

/**
 * Parse length-prefixed monitor frames from io.bin.
 * Default format is flat; pass `{ format: Compressed }` for legacy recordings.
 * Overload: `parseMonitorFrames(events, codecs)` still supported.
 */
export function parseMonitorFrames(
  events: Uint8Array,
  codecsOrOptions?: CodecRegistry | ParseMonitorFramesOptions
): DecodedFrame[] {
  let codecs: CodecRegistry | undefined
  let format = SerializationFormat.Flat
  if (isCodecRegistry(codecsOrOptions)) {
    codecs = codecsOrOptions
  } else if (codecsOrOptions) {
    codecs = codecsOrOptions.codecs
    if (codecsOrOptions.format !== undefined) format = codecsOrOptions.format
  }
  const resolved = codecs ?? createMonitorCodecs().codecs
  if (format === SerializationFormat.Compressed) {
    return parseMonitorFramesCompressed(events, resolved)
  }
  return parseMonitorFramesFlat(events, resolved)
}
