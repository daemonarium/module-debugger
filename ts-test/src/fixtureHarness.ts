import { readFile, writeFile, access, constants as fsConstants, cp, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  serializeTypeRegistry,
  SocketRpcClient,
  CodecRegistry,
  registerDynamicCodecs,
  ensureRpcCodecs,
  deserializeTypeRegistry,
  type TypeRegistry,
} from '@wa-os/ts-rpc'
import { LocalProcess, Direction } from '@wa-os/ts-kernel'
import {
  setupWasmTargetEnvironment,
  setupTokenKvEnvironment,
  withTempRoot,
  num,
  tick,
  STORE_ID,
  TARGET_ID,
  CLIENT_ID,
  SOCKET_OPTS,
  type WasmTargetTestContext,
} from '../../../recorder/ts-test/src/setup.js'
import { parseMonitorFrames } from '../../src/replay/frames.js'
import {
  SAMPLE_MODULE_SPECS,
  DBG_TOKEN_SPEC,
  DBG_CCLIENT_SPEC,
  DBG_MIXED_SPEC,
  buildDbgCpeerRegistry,
  type SampleModuleId,
  type SampleModuleSpec,
} from './sampleRegistries.js'


const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../../..')
const MODULES_DIR = join(REPO_ROOT, 'cmake-build-emscripten/examples/modules')

export const WAOSREC_BIN_CANDIDATES = [
  join(REPO_ROOT, 'build/waosrec'),
  join(REPO_ROOT, 'cmake-build-debug/waosrec'),
  join(REPO_ROOT, 'cmake-build/waosrec'),
]

export async function resolveWaosrecBin(): Promise<string> {
  for (const p of WAOSREC_BIN_CANDIDATES) {
    try {
      await access(p, fsConstants.X_OK)
      return p
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `waosrec not found; build with: cmake --build build --target waosrec (tried ${WAOSREC_BIN_CANDIDATES.join(', ')})`
  )
}

export function wasmPathFor(id: SampleModuleId): string {
  return join(MODULES_DIR, `${id}.wasm`)
}

export async function assertWasmExists(id: SampleModuleId): Promise<string> {
  const path = wasmPathFor(id)
  try {
    await access(path, fsConstants.R_OK)
  } catch {
    throw new Error(
      `Missing ${path}. Build with:\n` +
        `  cmake --build cmake-build-emscripten --target ${id}`
    )
  }
  return path
}

function methodIdOf(registry: TypeRegistry, shortName: string): number {
  const m = registry.getMethods().find(
    (x) => x.memberName === shortName || x.memberName.endsWith(`.${shortName}`)
  )
  if (!m) {
    throw new Error(
      `method ${shortName} missing; have: ${registry.getMethods().map((x) => x.memberName).join(', ')}`
    )
  }
  return m.methodId
}

export async function injectTargetRegistry(
  sessionDir: string,
  registry: TypeRegistry,
  processId: number = TARGET_ID
): Promise<void> {
  const bytes = serializeTypeRegistry(registry)
  await writeFile(join(sessionDir, `registry.${processId}.0.bin`), bytes)
}

export async function injectPeerRegistry(
  sessionDir: string,
  registry: TypeRegistry,
  processId: number,
  socketId: number = 0
): Promise<void> {
  const bytes = serializeTypeRegistry(registry)
  await writeFile(join(sessionDir, `registry.${processId}.${socketId}.bin`), bytes)
}

/**
 * Replay restores memory from the chosen snap then re-applies events.
 * Prefer the earliest snap (recording start) so additive state (mint, etc.) stays correct.
 */
export async function preferEarliestSnapshot(sessionDir: string): Promise<void> {
  const { readdir, unlink } = await import('node:fs/promises')
  const names = await readdir(sessionDir)
  const metas = names
    .map((n) => /^snap\.(\d+)\.meta\.bin$/.exec(n))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ meta: m[0], bin: `snap.${m[1]}.bin`, uid: Number(m[1]) }))
  if (metas.length <= 1) return
  metas.sort((a, b) => a.uid - b.uid)
  const keep = metas[0]
  for (const s of metas.slice(1)) {
    try {
      await unlink(join(sessionDir, s.meta))
    } catch {
      /* ignore */
    }
    try {
      await unlink(join(sessionDir, s.bin))
    } catch {
      /* ignore */
    }
  }
  void keep
}

export async function driveSample(
  ctx: { targetClient: SocketRpcClient; targetRegistry: TypeRegistry },
  spec: SampleModuleSpec
): Promise<void> {
  const client = ctx.targetClient
  const reg = ctx.targetRegistry
  const call = (name: string, ...args: unknown[]) =>
    client.call(methodIdOf(reg, name), ...args)

  switch (spec.id) {
    case 'dbg_echo': {
      const a = new TextEncoder().encode('hello-fixture')
      const b = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      await call('echo', a)
      await call('echo', b)
      break
    }
    case 'dbg_hello': {
      await call('hello')
      await call('fib', 10n)
      break
    }
    case 'dbg_counter': {
      await call('set', 3n)
      await call('inc')
      await call('inc')
      await call('get')
      break
    }
    case 'dbg_kv': {
      await call('put', 'alpha', 'one')
      await call('put', 'beta', 'two')
      await call('get', 'alpha')
      await call('keys')
      break
    }
    case 'dbg_stats': {
      await call('summarize', {
        tag: 0,
        values: [1n, 2n, 3n, 9n],
      })
      await call('summarize', {
        tag: 1,
        values: [4n, 4n],
      })
      break
    }
    case 'dbg_shop': {
      await call('name')
      await call('symbol')
      await call('mint', 'alice', 100n)
      await call('balanceOf', 'alice')
      // Avoid transfer: replaying from a late snap is non-idempotent for balances.
      break
    }
    case 'dbg_token':
    case 'dbg_cclient':
    case 'dbg_mixed': {
      await call('name')
      await call('symbol')
      await call('mint', 'alice', 100n)
      await call('balanceOf', 'alice')
      break
    }
    default:
      throw new Error(`unknown sample ${spec.id}`)
  }
}

export interface RecordedFixture {
  id: SampleModuleId
  sessionDir: string
  storeSessionId: number
  recordingId: unknown
  registry: TypeRegistry
  spec: SampleModuleSpec
}

export async function recordSampleFixture(
  rootDir: string,
  spec: SampleModuleSpec
): Promise<RecordedFixture> {
  const wasmPath = await assertWasmExists(spec.id)
  const ctx = await setupWasmTargetEnvironment(rootDir, {
    targetWasmPath: wasmPath,
    buildTargetRegistry: spec.buildRegistry,
  })
  try {
    await tick(20)

    const moduleCode = await readFile(wasmPath)
    const result = (await ctx.userClient.call(ctx.methodId('start_recording'), {
      target_process: BigInt(TARGET_ID),
      store_process: BigInt(STORE_ID),
      session_name: `fixture-${spec.id}`,
      labels: {
        sample: spec.id,
        complexity: String(spec.complexity),
      },
      config: {
        event_buffer_snapshot_mult: 2,
        record_mana: false,
        dump_on_error: true,
      },
      code: moduleCode,
    })) as Record<string, unknown>

    await tick(30)
    await driveSample(ctx, spec)
    await tick(40)

    await ctx.userClient.call(ctx.methodId('dump_and_clear'), result.recording_id)
    await tick(80)

    // Kill without error string — a reason emits process_error_event and can
    // trigger dump_on_error (second append of the same io window).
    await ctx.kernel.kill(TARGET_ID)
    await tick(80)

    const storeSessionId = num(result.store_session_id)
    const sessionDir = join(rootDir, 'sessions', String(storeSessionId))
    await injectTargetRegistry(sessionDir, ctx.targetRegistry)
    await preferEarliestSnapshot(sessionDir)

    return {
      id: spec.id,
      sessionDir,
      storeSessionId,
      recordingId: result.recording_id,
      registry: ctx.targetRegistry,
      spec,
    }
  } finally {
    await ctx.cleanup()
  }
}

export async function packSession(
  sessionDir: string,
  outPath: string,
  waosrecBin?: string
): Promise<void> {
  const bin = waosrecBin ?? (await resolveWaosrecBin())
  const pack = spawnSync(bin, ['pack', sessionDir, '-o', outPath], { encoding: 'utf8' })
  if (pack.status !== 0) {
    throw new Error(`waosrec pack failed: ${pack.stderr || pack.stdout}`)
  }
}

async function registerWithShield(
  ctx: WasmTargetTestContext,
  processId: number
): Promise<void> {
  ctx.recorder.unbind(ctx.shield, 1, 0, Direction.BOTH)

  const shieldDesc = deserializeTypeRegistry(ctx.shield.readRawRpcDescription(0))
  shieldDesc.assignMethodIds()
  const regId = shieldDesc
    .getMethods()
    .find((m) => m.memberName === 'kernel_shield.register_process')?.methodId
  if (regId === undefined) throw new Error('missing register_process')
  const localId = 50 + processId
  const sock = ctx.client.createSocket(localId, SOCKET_OPTS)
  ctx.client.bind(ctx.shield, localId, 0, Direction.BOTH)
  ctx.client.setRpcDescription(localId, shieldDesc)
  const codecs = new CodecRegistry()
  registerDynamicCodecs(codecs, shieldDesc)
  ensureRpcCodecs(codecs, shieldDesc)
  const sc = new SocketRpcClient(sock, shieldDesc, codecs)
  try {
    await sc.call(regId, processId, CLIENT_ID, false)
  } finally {
    ctx.client.unbind(ctx.shield, localId, 0, Direction.BOTH)
    ctx.recorder.bind(ctx.shield, 1, 0, Direction.BOTH)
  }
}

/**
 * Multi-process fixture: client spawned via shield, balances in peer KV/cpeer.
 */
async function recordPeerTokenFixture(
  rootDir: string,
  options: {
    spec: SampleModuleSpec
    clientWasmId: SampleModuleId
    peerWasmId: SampleModuleId
    targetRpcFormat?: 'flat' | 'compressed'
    buildPeerRegistry?: () => TypeRegistry
  }
): Promise<RecordedFixture> {
  const tokenPath = await assertWasmExists(options.clientWasmId)
  const kvPath = await assertWasmExists(options.peerWasmId)
  const ctx = await setupTokenKvEnvironment(rootDir, {
    tokenWasmPath: tokenPath,
    kvWasmPath: kvPath,
    buildTokenRegistry: options.spec.buildRegistry,
    buildPeerRegistry: options.buildPeerRegistry,
    targetRpcFormat: options.targetRpcFormat,
  })
  try {
    await tick(20)

    const moduleCode = await readFile(tokenPath)
    const result = (await ctx.userClient.call(ctx.methodId('start_recording'), {
      target_process: BigInt(ctx.tokenPid),
      store_process: BigInt(STORE_ID),
      session_name: `fixture-${options.spec.id}`,
      labels: {
        sample: options.spec.id,
        complexity: String(options.spec.complexity),
        kv_pid: String(ctx.kvPid),
      },
      config: {
        event_buffer_snapshot_mult: 2,
        record_mana: false,
        dump_on_error: true,
      },
      code: moduleCode,
    })) as Record<string, unknown>

    await tick(30)
    await driveSample(ctx, options.spec)
    await tick(40)

    await ctx.userClient.call(ctx.methodId('dump_and_clear'), result.recording_id)
    await tick(80)

    await ctx.kernel.kill(ctx.tokenPid)
    await tick(80)

    const storeSessionId = num(result.store_session_id)
    const sessionDir = join(rootDir, 'sessions', String(storeSessionId))
    await injectTargetRegistry(sessionDir, ctx.targetRegistry, ctx.tokenPid)
    if (ctx.peerRegistry) {
      await injectPeerRegistry(sessionDir, ctx.peerRegistry, ctx.kvPid, 0)
    }
    await preferEarliestSnapshot(sessionDir)

    return {
      id: options.spec.id,
      sessionDir,
      storeSessionId,
      recordingId: result.recording_id,
      registry: ctx.targetRegistry,
      spec: options.spec,
    }
  } finally {
    await ctx.cleanup()
  }
}

/** Multi-process fixture: dbg_token spawned via shield, balances in peer dbg_kv. */
export async function recordTokenKvFixture(rootDir: string): Promise<RecordedFixture> {
  return recordPeerTokenFixture(rootDir, {
    spec: DBG_TOKEN_SPEC,
    clientWasmId: 'dbg_token',
    peerWasmId: 'dbg_kv',
  })
}

/** Compressed↔compressed: dbg_cclient USER + peer dbg_cpeer. */
export async function recordCompClientFixture(rootDir: string): Promise<RecordedFixture> {
  return recordPeerTokenFixture(rootDir, {
    spec: DBG_CCLIENT_SPEC,
    clientWasmId: 'dbg_cclient',
    peerWasmId: 'dbg_cpeer',
    targetRpcFormat: 'compressed',
    buildPeerRegistry: buildDbgCpeerRegistry,
  })
}

/** Mixed: flat dbg_mixed USER + compressed peer dbg_cpeer. */
export async function recordMixedFixture(rootDir: string): Promise<RecordedFixture> {
  return recordPeerTokenFixture(rootDir, {
    spec: DBG_MIXED_SPEC,
    clientWasmId: 'dbg_mixed',
    peerWasmId: 'dbg_cpeer',
    targetRpcFormat: 'flat',
    buildPeerRegistry: buildDbgCpeerRegistry,
  })
}

/**
 * Bind-only session (no RPC stimulus/expect) for topology timeline UI tests.
 * Uses dbg_echo.wasm as code payload; allowZeroExpects for pack consumers.
 */
export async function recordTopologyFixture(rootDir: string): Promise<{
  sessionDir: string
  storeSessionId: number
}> {
  const wasmPath = await assertWasmExists('dbg_echo')
  const echoSpec = SAMPLE_MODULE_SPECS.find((s) => s.id === 'dbg_echo')!
  const ctx = await setupWasmTargetEnvironment(rootDir, {
    targetWasmPath: wasmPath,
    buildTargetRegistry: echoSpec.buildRegistry,
  })
  try {
    await tick(20)
    const moduleCode = await readFile(wasmPath)
    const result = (await ctx.userClient.call(ctx.methodId('start_recording'), {
      target_process: BigInt(TARGET_ID),
      store_process: BigInt(STORE_ID),
      session_name: 'fixture-dbg_topology',
      labels: { sample: 'dbg_topology' },
      config: {
        event_buffer_snapshot_mult: 2,
        record_mana: false,
        dump_on_error: true,
      },
      code: moduleCode,
    })) as Record<string, unknown>

    await tick(30)

    const peerId = 30
    const { createGeneratedTypeRegistry } = await import('@wa-os/ts-kernel/src/kernelApi.js')
    const peer = new LocalProcess(ctx.kernel, peerId, 1_000_000)
    while (ctx.kernel.processes.length <= peerId) {
      ctx.kernel.processes.push(null)
    }
    ctx.kernel.processes[peerId] = peer
    peer.createSocket(0, SOCKET_OPTS)
    peer.setRpcDescription(0, createGeneratedTypeRegistry().registry)
    await registerWithShield(ctx, peerId)

    await ctx.kernel.bind(TARGET_ID, 0, peerId, 0, Direction.BOTH)
    await tick(100)

    await ctx.userClient.call(ctx.methodId('dump_and_clear'), result.recording_id)
    await tick(80)

    await ctx.kernel.kill(TARGET_ID)
    await tick(80)

    const storeSessionId = num(result.store_session_id)
    const sessionDir = join(rootDir, 'sessions', String(storeSessionId))
    await injectTargetRegistry(sessionDir, ctx.targetRegistry)
    await preferEarliestSnapshot(sessionDir)

    return { sessionDir, storeSessionId }
  } finally {
    await ctx.cleanup()
  }
}

/** Flip one byte of the first expect Copy OUT payload in io.bin (in place). */
export async function corruptFirstExpectInSession(sessionDir: string): Promise<void> {
  const ioPath = join(sessionDir, 'io.bin')
  const io = new Uint8Array(await readFile(ioPath))
  const frames = parseMonitorFrames(io)
  const frame = frames.find((f) => f.class === 'expect' && f.payload.length > 0)
  if (!frame) {
    throw new Error('corruptFirstExpectInSession: no expect payload in io.bin')
  }
  const payload = frame.payload
  let found = -1
  outer: for (let i = frame.offset + 4; i <= io.length - payload.length; i++) {
    for (let j = 0; j < payload.length; j++) {
      if (io[i + j] !== payload[j]) continue outer
    }
    found = i
    break
  }
  if (found < 0) {
    throw new Error('corruptFirstExpectInSession: payload bytes not found')
  }
  io[found] = io[found]! ^ 0xff
  await writeFile(ioPath, io)
}

export async function copySessionDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const names = await readdir(src)
  for (const name of names) {
    await cp(join(src, name), join(dest, name), { recursive: true })
  }
}

export {
  SAMPLE_MODULE_SPECS,
  DBG_TOKEN_SPEC,
  DBG_CCLIENT_SPEC,
  DBG_MIXED_SPEC,
  withTempRoot,
  tick,
}
