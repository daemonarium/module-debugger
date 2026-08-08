import {
  TypeKind,
  TypeDescription,
  TypeRegistry,
  ensureRpcTypesInRegistry,
} from '@wa-os/ts-rpc'

function requireType(registry: TypeRegistry, name: string): TypeDescription {
  const t = registry.getTypeByName(name)
  if (!t) throw new Error(`TypeRegistry missing ${name}`)
  return t
}

function registerApi(
  registry: TypeRegistry,
  apiName: string,
  methods: Array<{ name: string; type: TypeDescription }>
): void {
  const api = TypeDescription.create({
    name: apiName,
    kind: TypeKind.Object,
    members: methods.map((m) => ({ name: m.name, type: m.type, annotations: [] })),
  })
  for (const m of methods) {
    registry.registerType(m.type)
  }
  registry.registerType(api)
}

/** Host TypeRegistry matching dbg_echo.wasm API. */
export function buildDbgEchoRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const binary = requireType(registry, 'binary')
  const echo = TypeDescription.create({
    name: 'DbgEcho.echo',
    kind: TypeKind.Function,
    members: [{ name: 'data', type: binary, annotations: [] }],
    item: binary,
  })
  registerApi(registry, 'DbgEcho', [{ name: 'echo', type: echo }])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export function buildDbgHelloRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const string_ = requireType(registry, 'string')
  const u64 = requireType(registry, 'uint64')
  const hello = TypeDescription.create({
    name: 'DbgHello.hello',
    kind: TypeKind.Function,
    members: [],
    item: string_,
  })
  const fib = TypeDescription.create({
    name: 'DbgHello.fib',
    kind: TypeKind.Function,
    members: [{ name: 'n', type: u64, annotations: [] }],
    item: u64,
  })
  registerApi(registry, 'DbgHello', [
    { name: 'hello', type: hello },
    { name: 'fib', type: fib },
  ])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export function buildDbgCounterRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const u64 = requireType(registry, 'uint64')
  const void_ = requireType(registry, 'void')
  const get = TypeDescription.create({
    name: 'DbgCounter.get',
    kind: TypeKind.Function,
    members: [],
    item: u64,
  })
  const set = TypeDescription.create({
    name: 'DbgCounter.set',
    kind: TypeKind.Function,
    members: [{ name: 'n', type: u64, annotations: [] }],
    item: void_,
  })
  const inc = TypeDescription.create({
    name: 'DbgCounter.inc',
    kind: TypeKind.Function,
    members: [],
    item: u64,
  })
  registerApi(registry, 'DbgCounter', [
    { name: 'get', type: get },
    { name: 'set', type: set },
    { name: 'inc', type: inc },
  ])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export function buildDbgKvRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const string_ = requireType(registry, 'string')
  const void_ = requireType(registry, 'void')
  const keysArr = TypeDescription.create({
    name: 'vector<string>',
    kind: TypeKind.Array,
    item: string_,
  })
  registry.registerType(keysArr)
  const put = TypeDescription.create({
    name: 'DbgKv.put',
    kind: TypeKind.Function,
    members: [
      { name: 'key', type: string_, annotations: [] },
      { name: 'value', type: string_, annotations: [] },
    ],
    item: void_,
  })
  const get = TypeDescription.create({
    name: 'DbgKv.get',
    kind: TypeKind.Function,
    members: [{ name: 'key', type: string_, annotations: [] }],
    item: string_,
  })
  const keys = TypeDescription.create({
    name: 'DbgKv.keys',
    kind: TypeKind.Function,
    members: [],
    item: keysArr,
  })
  registerApi(registry, 'DbgKv', [
    { name: 'put', type: put },
    { name: 'get', type: get },
    { name: 'keys', type: keys },
  ])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export function buildDbgStatsRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const u64 = requireType(registry, 'uint64')
  const u8 = requireType(registry, 'uint8')
  const valuesArr = TypeDescription.create({
    name: 'vector<uint64>',
    kind: TypeKind.Array,
    item: u64,
  })
  registry.registerType(valuesArr)
  const sampleTag = TypeDescription.create({
    name: 'SampleTag',
    kind: TypeKind.Enum,
    enumMembers: [
      { name: 'Raw', value: 0 },
      { name: 'Filtered', value: 1 },
    ],
  })
  registry.registerType(sampleTag)
  const sample = TypeDescription.create({
    name: 'Sample',
    kind: TypeKind.Object,
    members: [
      { name: 'tag', type: sampleTag, annotations: [] },
      { name: 'values', type: valuesArr, annotations: [] },
    ],
  })
  registry.registerType(sample)
  const stats = TypeDescription.create({
    name: 'Stats',
    kind: TypeKind.Object,
    members: [
      { name: 'min', type: u64, annotations: [] },
      { name: 'max', type: u64, annotations: [] },
      { name: 'mean', type: u64, annotations: [] },
      { name: 'count', type: u64, annotations: [] },
    ],
  })
  registry.registerType(stats)
  const summarize = TypeDescription.create({
    name: 'DbgStats.summarize',
    kind: TypeKind.Function,
    members: [{ name: 'sample', type: sample, annotations: [] }],
    item: stats,
  })
  registerApi(registry, 'DbgStats', [{ name: 'summarize', type: summarize }])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export function buildDbgShopRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const string_ = requireType(registry, 'string')
  const u64 = requireType(registry, 'uint64')
  const bool = requireType(registry, 'bool')
  const void_ = requireType(registry, 'void')
  const name = TypeDescription.create({
    name: 'DbgShop.name',
    kind: TypeKind.Function,
    members: [],
    item: string_,
  })
  const symbol = TypeDescription.create({
    name: 'DbgShop.symbol',
    kind: TypeKind.Function,
    members: [],
    item: string_,
  })
  const mint = TypeDescription.create({
    name: 'DbgShop.mint',
    kind: TypeKind.Function,
    members: [
      { name: 'addr', type: string_, annotations: [] },
      { name: 'amount', type: u64, annotations: [] },
    ],
    item: void_,
  })
  const balanceOf = TypeDescription.create({
    name: 'DbgShop.balanceOf',
    kind: TypeKind.Function,
    members: [{ name: 'addr', type: string_, annotations: [] }],
    item: u64,
  })
  const transfer = TypeDescription.create({
    name: 'DbgShop.transfer',
    kind: TypeKind.Function,
    members: [
      { name: 'from', type: string_, annotations: [] },
      { name: 'to', type: string_, annotations: [] },
      { name: 'amount', type: u64, annotations: [] },
    ],
    item: bool,
  })
  registerApi(registry, 'DbgShop', [
    { name: 'name', type: name },
    { name: 'symbol', type: symbol },
    { name: 'mint', type: mint },
    { name: 'balanceOf', type: balanceOf },
    { name: 'transfer', type: transfer },
  ])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

/** Host TypeRegistry matching dbg_token.wasm (balances stored in peer dbg_kv). */
export function buildDbgTokenRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const string_ = requireType(registry, 'string')
  const u64 = requireType(registry, 'uint64')
  const void_ = requireType(registry, 'void')
  const name = TypeDescription.create({
    name: 'DbgToken.name',
    kind: TypeKind.Function,
    members: [],
    item: string_,
  })
  const symbol = TypeDescription.create({
    name: 'DbgToken.symbol',
    kind: TypeKind.Function,
    members: [],
    item: string_,
  })
  const mint = TypeDescription.create({
    name: 'DbgToken.mint',
    kind: TypeKind.Function,
    members: [
      { name: 'addr', type: string_, annotations: [] },
      { name: 'amount', type: u64, annotations: [] },
    ],
    item: void_,
  })
  const balanceOf = TypeDescription.create({
    name: 'DbgToken.balanceOf',
    kind: TypeKind.Function,
    members: [{ name: 'addr', type: string_, annotations: [] }],
    item: u64,
  })
  registerApi(registry, 'DbgToken', [
    { name: 'name', type: name },
    { name: 'symbol', type: symbol },
    { name: 'mint', type: mint },
    { name: 'balanceOf', type: balanceOf },
  ])
  registry.assignMethodIds()
  ensureRpcTypesInRegistry(registry)
  return registry
}

export type SampleModuleId =
  | 'dbg_echo'
  | 'dbg_hello'
  | 'dbg_counter'
  | 'dbg_kv'
  | 'dbg_stats'
  | 'dbg_shop'
  | 'dbg_token'

export interface SampleModuleSpec {
  id: SampleModuleId
  title: string
  complexity: number
  api: string[]
  expects: string[]
  notes: string
  buildRegistry: () => TypeRegistry
}

export const SAMPLE_MODULE_SPECS: SampleModuleSpec[] = [
  {
    id: 'dbg_echo',
    title: 'Binary echo',
    complexity: 1,
    api: ['echo'],
    expects: ['stimulus', 'expect', 'hex'],
    notes: 'Two echo payloads (text + binary)',
    buildRegistry: buildDbgEchoRegistry,
  },
  {
    id: 'dbg_hello',
    title: 'Hello + fib',
    complexity: 2,
    api: ['hello', 'fib'],
    expects: ['stimulus', 'expect'],
    notes: 'Pure functions returning string and u64',
    buildRegistry: buildDbgHelloRegistry,
  },
  {
    id: 'dbg_counter',
    title: 'Stateful counter',
    complexity: 3,
    api: ['get', 'set', 'inc'],
    expects: ['stimulus', 'expect'],
    notes: 'set(3), inc×2, get',
    buildRegistry: buildDbgCounterRegistry,
  },
  {
    id: 'dbg_kv',
    title: 'Key-value store',
    complexity: 4,
    api: ['put', 'get', 'keys'],
    expects: ['stimulus', 'expect'],
    notes: 'map put/get/keys with string vector',
    buildRegistry: buildDbgKvRegistry,
  },
  {
    id: 'dbg_stats',
    title: 'Stats summarize',
    complexity: 5,
    api: ['summarize'],
    expects: ['stimulus', 'expect'],
    notes: 'enum + nested struct Sample → Stats',
    buildRegistry: buildDbgStatsRegistry,
  },
  {
    id: 'dbg_shop',
    title: 'Mini shop + topology',
    complexity: 6,
    api: ['name', 'symbol', 'mint', 'balanceOf', 'transfer'],
    expects: ['stimulus', 'expect'],
    notes: 'name/symbol/mint/balanceOf (transfer omitted for snap replay stability)',
    buildRegistry: buildDbgShopRegistry,
  },
]

/** Multi-process fixture (not in SAMPLE_MODULE_SPECS single-module loop). */
export const DBG_TOKEN_SPEC: SampleModuleSpec = {
  id: 'dbg_token',
  title: 'Token balances in dbg_kv (shield topology)',
  complexity: 7,
  api: ['name', 'symbol', 'mint', 'balanceOf'],
  expects: ['stimulus', 'expect', 'topology'],
  notes: 'Spawned via kernel-shield; peer RPC to dbg_kv on socket 2',
  buildRegistry: buildDbgTokenRegistry,
}
