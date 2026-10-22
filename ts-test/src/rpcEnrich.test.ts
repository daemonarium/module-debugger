import { expect } from 'chai'
import {
  CodecRegistry,
  LocalSocket,
  SocketMessageChannel,
  TypeRegistry,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  registerDynamicCodecs,
  RPC_REQUEST_TYPE,
  RPC_RESPONSE_TYPE,
  TypeKind,
  type RegisteredMethod,
} from '@daemonarium/rpc'
import { serializeTypeRegistry, serializeValueByType, registerMessageCodecs } from '@daemonarium/rpc'
import { enrichRpcMessages, findPairedMessage } from '../../src/replay/rpcEnrich.js'
import { buildMessageStream } from '../../src/replay/messageStream.js'
import type { StreamMessage, MessageByteSpan } from '../../src/replay/messageStream.js'
import type { DecodedFrame } from '../../src/replay/types.js'

function makeMockRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  registry.registerType({ name: 'string', kind: TypeKind.String })
  registry.registerType({ name: 'void', kind: TypeKind.Void })
  ensureRpcTypesInRegistry(registry)
  const stringType = registry.getTypeByName('string')!
  const voidType = registry.getTypeByName('void')!
  
  const helloFuncType = {
    name: 'hello',
    kind: TypeKind.Function,
    item: stringType,
    members: [{ name: 'name', type: stringType }],
  }
  registry.registerType(helloFuncType)

  registry.registerType({
    name: 'MyApi',
    kind: TypeKind.Object,
    members: [
      {
        name: 'hello',
        type: helloFuncType
      }
    ]
  })
  registry.assignMethodIds()
  return registry
}

function getRegistryBlob(registry: TypeRegistry): Uint8Array {
  const bytes = serializeTypeRegistry(registry)
  return bytes
}

describe('enrichRpcMessages', () => {
  it('enriches synthetic rpc_request and rpc_response', () => {
    const registry = makeMockRegistry()
    const methods = Array.from(registry.getMethods())
    const helloMethod = methods.find((m) => m.memberName === 'hello')!
    const registryBlob = getRegistryBlob(registry)

    ensureRpcTypesInRegistry(registry)
    const codecs = new CodecRegistry()
    registerDynamicCodecs(codecs, registry)
    registerMessageCodecs(codecs, registry)
    ensureRpcCodecs(codecs, registry)

    // Build framed request
    const sockReq = new LocalSocket(0, { inputBufferSize: 4096, outputBufferSize: 4096 })
    const chReq = new SocketMessageChannel(sockReq, codecs)
    chReq.registerMessageType(RPC_REQUEST_TYPE)
    const writerReq = chReq.beginSend(RPC_REQUEST_TYPE, { request_id: 10n, function_id: BigInt(helloMethod.methodId) })
    serializeValueByType(writerReq as any, registry, registry.getTypeByName('string')!, 'world')
    writerReq.writeRest()
    chReq.commitSend()
    const outReq = sockReq.outputBuffer
    const reqBytes = new Uint8Array(outReq.readableBytes())
    outReq.read(reqBytes, reqBytes.length)

    // Build framed response
    const sockRes = new LocalSocket(0, { inputBufferSize: 4096, outputBufferSize: 4096 })
    const chRes = new SocketMessageChannel(sockRes, codecs)
    chRes.registerMessageType(RPC_RESPONSE_TYPE)
    const writerRes = chRes.beginSend(RPC_RESPONSE_TYPE, { request_id: 10n })
    serializeValueByType(writerRes as any, registry, registry.getTypeByName('string')!, 'Hello world')
    writerRes.writeRest()
    chRes.commitSend()
    const outRes = sockRes.outputBuffer
    const resBytes = new Uint8Array(outRes.readableBytes())
    outRes.read(resBytes, resBytes.length)

    const makeMsg = (id: number, typeName: string, bytes: Uint8Array, header: any): StreamMessage => ({
      id,
      socket: 1,
      direction: 'out',
      bytes,
      body: bytes.subarray(4),
      spans: [],
      frameIndices: [],
      typeName,
      header,
      payloadSize: bytes.length - 4 - 8 - 1, // rough estimate, not used in enrichment directly except for zero check
      registryKey: 'reg1',
    })

    const messages: StreamMessage[] = [
      makeMsg(1, RPC_REQUEST_TYPE, reqBytes, { request_id: 10n, function_id: BigInt(helloMethod.methodId) }),
      makeMsg(2, RPC_RESPONSE_TYPE, resBytes, { request_id: 10n }),
    ]

    messages[1]!.payloadSize = 100 // force it to try reading

    const registriesInput = new Map([['reg1', registryBlob]])
    const enriched = enrichRpcMessages(messages, registriesInput)

    expect(enriched).to.have.length(2)
    
    const req = enriched[0]!
    expect(req.rpc).to.be.ok
    expect(req.rpc!.kind).to.equal('request')
    expect(req.rpc!.requestId).to.equal('10')
    expect(req.rpc!.methodName).to.equal('hello')
    expect(req.rpc!.args).to.have.length(1)
    expect(req.rpc!.args![0]!.name).to.equal('name')
    expect(req.rpc!.args![0]!.value).to.equal('world')
    expect(req.rpc!.args![0]!.type.name).to.equal('string')
    
    const res = enriched[1]!
    expect(res.rpc).to.be.ok
    expect(res.rpc!.kind).to.equal('response')
    expect(res.rpc!.requestId).to.equal('10')
    expect(res.rpc!.methodName).to.equal('hello')
    expect(res.rpc!.returnTypeName).to.equal('string')
    expect(res.rpc!.returnValue).to.equal('Hello world')
  })

  it('handles unknown function_id without throwing', () => {
    const registry = makeMockRegistry()
    const registryBlob = getRegistryBlob(registry)

    ensureRpcTypesInRegistry(registry)
    const codecs = new CodecRegistry()
    registerMessageCodecs(codecs, registry)
    ensureRpcCodecs(codecs, registry)

    const sockReq = new LocalSocket(0, { inputBufferSize: 4096, outputBufferSize: 4096 })
    const chReq = new SocketMessageChannel(sockReq, codecs)
    chReq.registerMessageType(RPC_REQUEST_TYPE)
    const writerReq = chReq.beginSend(RPC_REQUEST_TYPE, { request_id: 99n, function_id: 9999n })
    writerReq.writeRest()
    chReq.commitSend()
    const outReq = sockReq.outputBuffer
    const reqBytes = new Uint8Array(outReq.readableBytes())
    outReq.read(reqBytes, reqBytes.length)

    const messages: StreamMessage[] = [{
      id: 1,
      socket: 1,
      direction: 'out',
      bytes: reqBytes,
      body: reqBytes.subarray(4),
      spans: [],
      frameIndices: [],
      typeName: RPC_REQUEST_TYPE,
      header: { request_id: 99n, function_id: 9999n },
      registryKey: 'reg1',
    }]

    const enriched = enrichRpcMessages(messages, new Map([['reg1', registryBlob]]))
    expect(enriched[0]!.rpc!.enrichError).to.include('Unknown function_id 9999')
  })

  it('findPairedMessage links request and response on same socket + request_id', () => {
    const messages = [
      {
        id: 1,
        socket: 2,
        direction: 'out' as const,
        bytes: new Uint8Array(),
        body: new Uint8Array(),
        spans: [],
        frameIndices: [1],
        typeName: 'rpc_request',
        rpc: { kind: 'request' as const, requestId: '7', args: [] },
      },
      {
        id: 2,
        socket: 2,
        direction: 'in' as const,
        bytes: new Uint8Array(),
        body: new Uint8Array(),
        spans: [],
        frameIndices: [2],
        typeName: 'rpc_response',
        rpc: { kind: 'response' as const, requestId: '7', returnValue: 1 },
      },
      {
        id: 3,
        socket: 3,
        direction: 'in' as const,
        bytes: new Uint8Array(),
        body: new Uint8Array(),
        spans: [],
        frameIndices: [3],
        typeName: 'rpc_response',
        rpc: { kind: 'response' as const, requestId: '7' },
      },
    ]

    expect(findPairedMessage(messages, messages[0]!)?.id).to.equal(2)
    expect(findPairedMessage(messages, messages[1]!)?.id).to.equal(1)
    expect(findPairedMessage(messages, messages[2]!)).to.equal(null)
  })
})