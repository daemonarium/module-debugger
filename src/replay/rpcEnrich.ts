import {
  CodecRegistry,
  LocalCircularBuffer,
  LocalCircularBufferReader,
  ensureRpcCodecs,
  ensureRpcTypesInRegistry,
  registerDynamicCodecs,
  TypeRegistry,
  TypeKind,
  type RegisteredMethod,
  type TypeDescription,
  registerMessageCodecs,
  deserializeValueByType
} from '@wa-os/ts-rpc'
import type { StreamMessage } from './messageStream.js'
import { loadTypeRegistryFromBytes } from './sessionFiles.js'

export interface RpcCallArg {
  name: string
  type: TypeDescription
  value: unknown
}

export interface RpcEnrichment {
  kind: 'request' | 'response' | 'error' | 'other'
  requestId?: string
  functionId?: number
  methodName?: string
  ownerTypeName?: string
  paramTypes?: Array<{ name: string; typeName: string; type: TypeDescription }>
  returnType?: TypeDescription
  returnTypeName?: string
  objectId?: unknown
  args?: RpcCallArg[]
  returnValue?: unknown
  exception?: { typeName: string; value: unknown }
  enrichError?: string
}

export interface EnrichedStreamMessage extends StreamMessage {
  rpc?: RpcEnrichment
}

function getCodecs(registry: TypeRegistry): CodecRegistry {
  ensureRpcTypesInRegistry(registry)
  const codecs = new CodecRegistry()
  registerDynamicCodecs(codecs, registry)
  registerMessageCodecs(codecs, registry)
  ensureRpcCodecs(codecs, registry)
  return codecs
}

function getTrailingReader(body: Uint8Array, codecs: CodecRegistry): LocalCircularBufferReader {
  const buffer = new LocalCircularBuffer(Math.max(body.length + 64, 256))
  buffer.write(body, body.length)
  const reader = new LocalCircularBufferReader(buffer, codecs)
  const typeIndex = Number(reader.readU64())
  const codec = codecs.messages.getByIndex(typeIndex)
  codec.deserialize(reader as any, () => {})
  return reader
}

interface PendingRequest {
  functionId: number
  method: RegisteredMethod
  methodName: string
  returnType: TypeDescription
  returnTypeName: string
}

/**
 * Find the request↔response/error pair for a message on the same socket + request_id.
 */
export function findPairedMessage(
  messages: EnrichedStreamMessage[],
  message: EnrichedStreamMessage | null | undefined
): EnrichedStreamMessage | null {
  if (!message?.rpc) return null
  const { kind, requestId } = message.rpc
  if (!requestId || kind === 'other') return null

  if (kind === 'request') {
    return (
      messages.find(
        (m) =>
          m.id !== message.id &&
          m.socket === message.socket &&
          m.rpc?.requestId === requestId &&
          (m.rpc.kind === 'response' || m.rpc.kind === 'error')
      ) ?? null
    )
  }

  if (kind === 'response' || kind === 'error') {
    return (
      messages.find(
        (m) =>
          m.id !== message.id &&
          m.socket === message.socket &&
          m.rpc?.requestId === requestId &&
          m.rpc.kind === 'request'
      ) ?? null
    )
  }

  return null
}

export function enrichRpcMessages(
  messages: StreamMessage[],
  registriesInput: Map<string, Uint8Array>
): EnrichedStreamMessage[] {
  const registriesCache = new Map<string, { typeRegistry: TypeRegistry; codecs: CodecRegistry; methodsById: Map<number, RegisteredMethod> }>()

  function getRegistries(key: string | undefined) {
    if (!key) return undefined
    if (registriesCache.has(key)) return registriesCache.get(key)
    const bytes = registriesInput.get(key)
    if (!bytes || bytes.length === 0) return undefined
    try {
      const typeRegistry = loadTypeRegistryFromBytes(bytes)
      typeRegistry.assignMethodIds()
      const methodsById = new Map<number, RegisteredMethod>()
      for (const m of typeRegistry.getMethods()) {
        methodsById.set(m.methodId, m)
      }
      const codecs = getCodecs(typeRegistry)
      const entry = { typeRegistry, codecs, methodsById }
      registriesCache.set(key, entry)
      return entry
    } catch (e) {
      console.error('getRegistries error:', e)
      return undefined
    }
  }

  const pendingRequests = new Map<number, Map<string, PendingRequest>>()
  const getPendingMap = (socket: number) => {
    let m = pendingRequests.get(socket)
    if (!m) {
      m = new Map()
      pendingRequests.set(socket, m)
    }
    return m
  }

  return messages.map((msg): EnrichedStreamMessage => {
    const enriched: EnrichedStreamMessage = { ...msg }
    if (!msg.typeName) return enriched

    const isRequest = msg.typeName === 'rpc_request'
    const isResponse = msg.typeName === 'rpc_response'
    const isError = msg.typeName === 'rpc_error'

    if (!isRequest && !isResponse && !isError) {
      enriched.rpc = { kind: 'other' }
      return enriched
    }

    const rpc: RpcEnrichment = {
      kind: isRequest ? 'request' : isResponse ? 'response' : 'error'
    }
    enriched.rpc = rpc

    const regs = getRegistries(msg.registryKey)
    if (!regs) {
      rpc.enrichError = 'No registry available for decoding RPC payload'
      return enriched
    }

    const header = msg.header as any
    if (header && typeof header === 'object' && 'request_id' in header) {
      rpc.requestId = String(header.request_id)
    }

    try {
      const reader = getTrailingReader(msg.body, regs.codecs)

      if (isRequest) {
        if (header && 'function_id' in header) {
          rpc.functionId = Number(header.function_id)
          const method = regs.methodsById.get(rpc.functionId)
          if (method) {
            rpc.methodName = method.memberName
            rpc.ownerTypeName = method.ownerType.name

            const returnType = method.methodType.item || { kind: TypeKind.Void, name: 'void' } as TypeDescription
            rpc.returnType = returnType
            rpc.returnTypeName = returnType.name

            if (rpc.requestId !== undefined) {
              getPendingMap(msg.socket).set(rpc.requestId, {
                functionId: rpc.functionId,
                method,
                methodName: rpc.methodName,
                returnType,
                returnTypeName: rpc.returnTypeName,
              })
            }

            if (method.methodType.kind === TypeKind.Method) {
              const idMember = method.ownerType.members?.find(m => m.type.kind !== TypeKind.Method && m.type.kind !== TypeKind.Function)
              if (idMember) {
                let objId: unknown
                deserializeValueByType(reader as any, regs.typeRegistry, idMember.type, (v) => objId = v)
                rpc.objectId = objId
              }
            }

            const paramMembers = method.methodType.members || []
            rpc.paramTypes = paramMembers.map(m => ({ name: m.name, typeName: m.type.name, type: m.type }))
            rpc.args = []
            
            for (const param of paramMembers) {
              let val: unknown
              deserializeValueByType(reader as any, regs.typeRegistry, param.type, (v) => val = v)
              rpc.args.push({ name: param.name, type: param.type, value: val })
            }
          } else {
            rpc.enrichError = `Unknown function_id ${rpc.functionId}`
          }
        }
      } else if (isResponse) {
        if (rpc.requestId !== undefined) {
          const req = getPendingMap(msg.socket).get(rpc.requestId)
          if (req) {
            rpc.methodName = req.methodName
            rpc.returnType = req.returnType
            rpc.returnTypeName = req.returnTypeName

            if (req.returnType.kind !== TypeKind.Void && msg.payloadSize && msg.payloadSize > 0) {
              let retVal: unknown
              deserializeValueByType(reader as any, regs.typeRegistry, req.returnType, (v) => retVal = v)
              rpc.returnValue = retVal
            }
          } else {
             // response without known request
             if (msg.payloadSize && msg.payloadSize > 0) {
                 rpc.enrichError = 'Response payload present, but request method unknown (cannot deserialize without type)'
             }
          }
        }
      } else if (isError) {
        if (rpc.requestId !== undefined) {
          const req = getPendingMap(msg.socket).get(rpc.requestId)
          if (req) {
            rpc.methodName = req.methodName
          }
        }
        const exc = reader.readException()
        rpc.exception = { typeName: exc.typeName, value: exc.value }
      }

    } catch (e) {
      rpc.enrichError = e instanceof Error ? e.message : String(e)
    }

    return enriched
  })
}
