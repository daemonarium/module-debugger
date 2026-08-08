import { expect } from 'chai'
import {
  CodecRegistry,
  LocalSocket,
  SocketMessageChannel,
  TypeRegistry,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  RPC_REQUEST_TYPE,
} from '@wa-os/ts-rpc'
import {
  decodeSocketPayload,
  resolveRegistryBytes,
} from '../../src/replay/decode.js'
import { registryKey } from '../../src/replay/types.js'

const BUF_SIZE = 4096
const SOCKET_OPTS = {
  inputBufferSize: BUF_SIZE,
  outputBufferSize: BUF_SIZE,
  flushThreshold: BUF_SIZE,
  dataEventThreshold: 0,
  drainEventThreshold: BUF_SIZE,
  flags: 0,
}

function encodeRpcRequestFrame(requestId: number, functionId: number): Uint8Array {
  const registry = new TypeRegistry()
  ensureRpcTypesInRegistry(registry)
  const codecs = new CodecRegistry()
  ensureRpcCodecs(codecs, registry)
  const socket = new LocalSocket(0, SOCKET_OPTS)
  const channel = new SocketMessageChannel(socket, codecs)
  channel.registerMessageType(RPC_REQUEST_TYPE)
  channel.sendMessage(RPC_REQUEST_TYPE, {
    _type: RPC_REQUEST_TYPE,
    request_id: BigInt(requestId),
    function_id: BigInt(functionId),
  })
  const out = socket.outputBuffer
  const n = out.readableBytes()
  const bytes = new Uint8Array(n)
  out.read(bytes, n)
  return bytes
}

describe('decodeSocketPayload', () => {
  it('decodes a length-prefixed rpc_request', () => {
    const bytes = encodeRpcRequestFrame(7, 3)
    expect(bytes.length).to.be.greaterThan(4)
    const registry = new TypeRegistry()
    ensureRpcTypesInRegistry(registry)
    const result = decodeSocketPayload(bytes, registry)
    expect(result.ok, result.error).to.equal(true)
    expect(result.messages).to.have.length(1)
    expect(result.messages[0].typeName).to.equal(RPC_REQUEST_TYPE)
    const header = result.messages[0].header as Record<string, unknown>
    expect(Number(header.request_id)).to.equal(7)
    expect(Number(header.function_id)).to.equal(3)
  })

  it('fails clearly on raw non-RPC bytes', () => {
    const registry = new TypeRegistry()
    ensureRpcTypesInRegistry(registry)
    const result = decodeSocketPayload(new Uint8Array([0xca, 0xfe, 0xba, 0xbe]), registry)
    expect(result.ok).to.equal(false)
    expect(result.error).to.be.a('string')
  })
})

describe('resolveRegistryBytes', () => {
  it('prefers peer registry when topology is set', () => {
    const topology = new Map([
      [0, { peerProcess: 9, peerSocket: 1, direction: 1 }],
    ])
    const registries = new Map<string, Uint8Array>([
      [registryKey(9, 1), new Uint8Array([1, 2])],
      [registryKey(5, 0), new Uint8Array([3])],
    ])
    const resolved = resolveRegistryBytes(0, 5, topology, registries)
    expect(resolved.key).to.equal('9.1')
    expect(resolved.bytes!.length).to.equal(2)
  })
})
