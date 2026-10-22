import { expect } from 'chai'
import { readFile } from 'node:fs/promises'
import { access, constants as fsConstants } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  encodeMonitorFrame,
  loadWaosrec,
  loadTypeRegistryFromBytes,
  parseMonitorFrames,
  buildMessageStream,
  extractCompleteMessages,
  messageAtEventIndex,
  nextMessage,
  type DecodedFrame,
  type BindingsSnapshotView,
} from '../../src/replay/index.js'
import { kernelApi } from '@daemonarium/kernel'
import { SerializationFormat } from '@daemonarium/rpc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_REGISTRY = join(__dirname, '../../fixtures/waosrec.rpc_description.bin')
const ECHO_WAOSREC = join(__dirname, '../../fixtures/recordings/dbg_echo.waosrec')

function emptyBindings(processId = 5): BindingsSnapshotView {
  return { processId, bindings: [] }
}

function framedRpc(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + body.length)
  new DataView(out.buffer).setUint32(0, body.length, true)
  out.set(body, 4)
  return out
}

function copyFrame(
  socket: number,
  dir: number,
  payload: Uint8Array
): DecodedFrame {
  const encoded = encodeMonitorFrame(
    'process_copy_event',
    {
      _type: 'process_copy_event',
      process: 5,
      socket,
      direction: dir,
      amount: payload.length,
    },
    payload
  )
  const frames = parseMonitorFrames(encoded)
  expect(frames).to.have.length(1)
  return frames[0]!
}

describe('messageStream', () => {
  it('extractCompleteMessages splits multiple frames and leaves rest', () => {
    const a = framedRpc(new Uint8Array([1, 2, 3]))
    const b = framedRpc(new Uint8Array([4, 5]))
    const partial = new Uint8Array([0x02, 0x00]) // incomplete length / body
    const buf = new Uint8Array(a.length + b.length + partial.length)
    buf.set(a, 0)
    buf.set(b, a.length)
    buf.set(partial, a.length + b.length)

    const { messages, rest } = extractCompleteMessages(buf)
    expect(messages).to.have.length(2)
    expect(messages[0]!.bytes).to.deep.equal(a)
    expect(messages[1]!.bytes).to.deep.equal(b)
    expect(rest).to.deep.equal(partial)
  })

  it('reassembles one message split across two Copy IN frames', () => {
    const body = new Uint8Array(20).map((_, i) => i + 1)
    const full = framedRpc(body)
    const mid = Math.floor(full.length / 2)
    const part1 = full.subarray(0, mid)
    const part2 = full.subarray(mid)

    const frames = [
      copyFrame(0, kernelApi.direction.IN, part1),
      copyFrame(0, kernelApi.direction.IN, part2),
    ]
    // Offsets differ when separately encoded — rebuild as logical stream only via payloads:
    // copyFrame re-encodes; payloads are part1/part2. Good.

    const stream = buildMessageStream(frames, 5, emptyBindings(), new Map())
    const complete = stream.filter((m) => !m.incomplete)
    expect(complete).to.have.length(1)
    expect(complete[0]!.direction).to.equal('in')
    expect(complete[0]!.socket).to.equal(0)
    expect(complete[0]!.frameIndices).to.deep.equal([0, 1])
    expect(complete[0]!.bytes).to.deep.equal(full)
    expect(complete[0]!.spans.length).to.be.greaterThanOrEqual(1)
  })

  it('extracts two messages from a single Copy payload', () => {
    const a = framedRpc(new Uint8Array([9, 9, 9]))
    const b = framedRpc(new Uint8Array([8, 8]))
    const combined = new Uint8Array(a.length + b.length)
    combined.set(a, 0)
    combined.set(b, a.length)

    const frames = [copyFrame(1, kernelApi.direction.OUT, combined)]
    const stream = buildMessageStream(frames, 5, emptyBindings(), new Map())
    const complete = stream.filter((m) => !m.incomplete)
    expect(complete).to.have.length(2)
    expect(complete[0]!.frameIndices).to.deep.equal([0])
    expect(complete[1]!.frameIndices).to.deep.equal([0])
    expect(complete[0]!.direction).to.equal('out')
    expect(complete[0]!.bytes).to.deep.equal(a)
    expect(complete[1]!.bytes).to.deep.equal(b)
  })

  it('emits incomplete tail when length prefix cannot be satisfied', () => {
    const frames = [copyFrame(0, kernelApi.direction.IN, new Uint8Array([0x10, 0x00, 0x00]))]
    const stream = buildMessageStream(frames, 5, emptyBindings(), new Map())
    expect(stream).to.have.length(1)
    expect(stream[0]!.incomplete).to.equal(true)
    expect(stream[0]!.bytes.length).to.equal(3)
  })

  it('builds IN and OUT messages from dbg_echo fixture when present', async function () {
    try {
      await access(ECHO_WAOSREC, fsConstants.R_OK)
    } catch {
      this.skip()
      return
    }
    const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
    const dump = loadWaosrec(await readFile(ECHO_WAOSREC), typeRegistry)
    const frames = parseMonitorFrames(dump.events, {
      format: SerializationFormat.Flat,
    })
    const stream = buildMessageStream(
      frames,
      dump.session.processId,
      dump.bindings,
      dump.registries
    )
    const complete = stream.filter((m) => !m.incomplete)
    expect(complete.some((m) => m.direction === 'in')).to.equal(true)
    expect(complete.some((m) => m.direction === 'out')).to.equal(true)
    const decoded = complete.filter((m) => m.typeName)
    expect(decoded.length).to.be.greaterThan(0)
  })

  it('messageAtEventIndex and nextMessage navigate the stream', () => {
    const a = framedRpc(new Uint8Array([1]))
    const b = framedRpc(new Uint8Array([2]))
    const frames = [
      copyFrame(0, kernelApi.direction.IN, a),
      copyFrame(0, kernelApi.direction.OUT, b),
    ]
    const stream = buildMessageStream(frames, 5, emptyBindings(), new Map())
    const complete = stream.filter((m) => !m.incomplete)
    expect(complete.length).to.be.greaterThanOrEqual(2)

    const first = complete[0]!
    const second = complete[1]!
    expect(messageAtEventIndex(stream, first.frameIndices[0]!)?.id).to.equal(first.id)
    expect(messageAtEventIndex(stream, second.frameIndices[0]!)?.id).to.equal(second.id)
    expect(nextMessage(stream, first.id)?.id).to.equal(second.id)
    expect(nextMessage(stream, second.id)).to.equal(null)
  })
})
