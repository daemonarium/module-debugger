import { expect } from 'chai'
import fsp from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  setupWasmTargetEnvironment,
  withTempRoot,
  num,
  tick,
  STORE_ID,
  TARGET_ID,
} from '../../../recorder/ts-test/src/setup.js'
import {
  loadSessionDir,
  loadWaosrec,
  loadTypeRegistryFromBytes,
  buildDumpFromSessionFiles,
  ReplayRuntime,
  ReplayError,
} from '../../src/replay/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_REGISTRY = join(__dirname, '../../fixtures/waosrec.rpc_description.bin')
const MOCK_MODULE_WASM = join(
  __dirname,
  '../../../cmake-build-emscripten/kernel-shield/cpp-test/mock-module.wasm'
)
const WAOSREC_BIN = join(__dirname, '../../../build/waosrec')

describe('ReplayRuntime headless', () => {
  it('replays mock-module echo dump and asserts Copy OUT', async () => {
    await withTempRoot(async (root) => {
      const ctx = await setupWasmTargetEnvironment(root)
      try {
        const moduleCode = await readFile(MOCK_MODULE_WASM)
        const result = await ctx.userClient.call(ctx.methodId('start_recording'), {
          target_process: BigInt(TARGET_ID),
          store_process: BigInt(STORE_ID),
          session_name: 'replay-echo',
          labels: { scenario: 'replay' },
          config: {
            event_buffer_snapshot_mult: 2,
            record_mana: false,
            dump_on_error: true,
          },
          code: moduleCode,
        }) as Record<string, unknown>

        await tick(30)

        const payloadA = new TextEncoder().encode('hello-replay-1')
        const payloadB = new Uint8Array([0xca, 0xfe, 0xba, 0xbe])
        const echoedA = await ctx.echo(payloadA)
        expect(Buffer.from(echoedA).equals(Buffer.from(payloadA))).to.equal(true)
        const echoedB = await ctx.echo(payloadB)
        expect(Buffer.from(echoedB).equals(Buffer.from(payloadB))).to.equal(true)
        await tick(40)

        await ctx.userClient.call(ctx.methodId('dump_and_clear'), result.recording_id)
        await tick(80)

        await ctx.kernel.kill(TARGET_ID)
        await tick(80)

        const sessionId = num(result.store_session_id)
        const dir = join(root, 'sessions', String(sessionId))
        const listing = await fsp.readdir(dir)
        expect(listing.some((f) => f.endsWith('.meta.bin')), `files=${listing.join(',')}`).to.equal(true)
        await fsp.access(join(dir, 'code.wasm'))
        await fsp.access(join(dir, 'io.bin'))

        const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
        const dump = await loadSessionDir(dir, typeRegistry)
        expect(dump.code.length).to.be.greaterThan(0)
        expect(dump.memory.length).to.be.greaterThan(0)
        expect(dump.events.length).to.be.greaterThan(0)

        const fileMap = new Map<string, Uint8Array>()
        for (const name of listing) {
          fileMap.set(name, new Uint8Array(await readFile(join(dir, name))))
        }
        const fromFiles = buildDumpFromSessionFiles(fileMap, typeRegistry)
        expect(fromFiles.code.length).to.equal(dump.code.length)
        expect(fromFiles.memory.length).to.equal(dump.memory.length)
        expect(fromFiles.events.length).to.equal(dump.events.length)

        const packedPath = join(root, 'echo.waosrec')
        const pack = spawnSync(WAOSREC_BIN, ['pack', dir, '-o', packedPath], { encoding: 'utf8' })
        expect(pack.status, pack.stderr).to.equal(0)
        const fromWaosrec = loadWaosrec(await readFile(packedPath), typeRegistry)
        expect(fromWaosrec.code.length).to.equal(dump.code.length)
        expect(fromWaosrec.memory.length).to.equal(dump.memory.length)
        expect(fromWaosrec.events.length).to.equal(dump.events.length)

        const runtime = await ReplayRuntime.create(dump)
        const mid = Math.min(3, runtime.frames.length)
        await runtime.seek(mid)
        expect(runtime.state.index).to.equal(mid)
        await runtime.seek(0)
        expect(runtime.state.index).to.equal(0)
        expect(runtime.state.expectMatches).to.equal(0)

        try {
          runtime.run()
        } catch (error) {
          if (error instanceof ReplayError) {
            expect.fail(`replay failed: ${error.message}`)
          }
          throw error
        }

        expect(runtime.state.expectMatches).to.be.greaterThan(0)
        expect(runtime.state.lastError).to.equal(undefined)
      } finally {
        await ctx.cleanup()
      }
    })
  })
})
