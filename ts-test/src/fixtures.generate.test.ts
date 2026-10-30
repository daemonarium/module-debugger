import { expect } from 'chai'
import fsp from 'node:fs/promises'
import { join } from 'node:path'
import {
  loadWaosrec,
  loadTypeRegistryFromBytes,
  ReplayRuntime,
  ReplayError,
  parseMonitorFrames,
} from '@daemonarium/replay'
import {
  SAMPLE_MODULE_SPECS,
  DBG_TOKEN_SPEC,
  DBG_CCLIENT_SPEC,
  DBG_MIXED_SPEC,
  recordSampleFixture,
  recordTopologyFixture,
  recordTokenKvFixture,
  recordCompClientFixture,
  recordMixedFixture,
  packSession,
  withTempRoot,
  resolveWaosrecBin,
} from './fixtureHarness.js'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_REGISTRY = join(__dirname, '../../fixtures/waosrec.rpc_description.bin')

describe('sample recording fixtures', function () {
  this.timeout(300_000)

  for (const spec of SAMPLE_MODULE_SPECS) {
    it(`records, packs, and replays ${spec.id}`, async () => {
      await withTempRoot(async (root) => {
        const recorded = await recordSampleFixture(root, spec)
        const listing = await fsp.readdir(recorded.sessionDir)
        expect(listing.some((f) => f === 'code.wasm')).to.equal(true)
        expect(listing.some((f) => f === 'io.bin')).to.equal(true)
        expect(listing.some((f) => f.startsWith('snap.') && f.endsWith('.bin'))).to.equal(true)

        const regPath = join(recorded.sessionDir, `registry.5.0.bin`)
        const regBytes = await readFile(regPath)
        expect(regBytes.length).to.be.greaterThan(0)

        const io = await readFile(join(recorded.sessionDir, 'io.bin'))
        expect(io.length).to.be.greaterThan(0)
        const frames = parseMonitorFrames(new Uint8Array(io))
        expect(frames.some((f) => f.class === 'expect')).to.equal(true)

        const packed = join(root, `${spec.id}.waosrec`)
        await packSession(recorded.sessionDir, packed, await resolveWaosrecBin())

        const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
        const dump = loadWaosrec(await readFile(packed), typeRegistry)
        expect(dump.code.length).to.be.greaterThan(0)
        expect(dump.events.length).to.be.greaterThan(0)

        const runtime = await ReplayRuntime.create(dump)
        try {
          runtime.run()
        } catch (error) {
          if (error instanceof ReplayError) {
            expect.fail(`${spec.id} replay failed: ${error.message}`)
          }
          throw error
        }
        expect(runtime.state.expectMatches).to.be.greaterThan(0)
        expect(runtime.state.lastError).to.equal(undefined)
      })
    })
  }

  it('records topology bind-only dump with topology frames', async () => {
    await withTempRoot(async (root) => {
      const recorded = await recordTopologyFixture(root)
      const io = await readFile(join(recorded.sessionDir, 'io.bin'))
      const frames = parseMonitorFrames(new Uint8Array(io))
      expect(frames.some((f) => f.class === 'topology')).to.equal(true)

      const packed = join(root, 'dbg_topology.waosrec')
      await packSession(recorded.sessionDir, packed, await resolveWaosrecBin())
      const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
      const dump = loadWaosrec(await readFile(packed), typeRegistry)
      expect(dump.code.length).to.be.greaterThan(0)
    })
  })

  it('records dbg_token with shield topology + kv peer and replays', async () => {
    await withTempRoot(async (root) => {
      const recorded = await recordTokenKvFixture(root)
      const listing = await fsp.readdir(recorded.sessionDir)
      expect(listing.some((f) => f === 'code.wasm')).to.equal(true)
      expect(listing.some((f) => f === 'io.bin')).to.equal(true)

      const io = await readFile(join(recorded.sessionDir, 'io.bin'))
      const frames = parseMonitorFrames(new Uint8Array(io))
      expect(frames.some((f) => f.class === 'expect')).to.equal(true)

      // Peer / kernel bindings should leave registry files or bindings snapshot
      const regFiles = listing.filter((f) => f.startsWith('registry.'))
      expect(regFiles.length).to.be.greaterThan(1)

      const packed = join(root, 'dbg_token.waosrec')
      await packSession(recorded.sessionDir, packed, await resolveWaosrecBin())

      const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
      const dump = loadWaosrec(await readFile(packed), typeRegistry)
      expect(dump.bindings.bindings.length).to.be.greaterThan(1)

      const target0 = dump.registries.get(`${dump.session.processId}.0`)
      expect(target0?.length ?? 0, 'target USER registry soft-fetched').to.be.greaterThan(0)

      const shieldKernelApi = [...dump.registries.entries()].find(([k, v]) => {
        const m = /^1\.(\d+)$/.exec(k)
        if (!m) return false
        const sock = Number(m[1])
        return sock > 3 && (sock & 1) === 1 && v.length > 0
      })
      expect(shieldKernelApi, 'non-empty shield KERNEL_API registry (1.(pid<<1)|1)').to.not.equal(
        undefined
      )

      const runtime = await ReplayRuntime.create(dump)
      try {
        runtime.run()
      } catch (error) {
        if (error instanceof ReplayError) {
          expect.fail(`${DBG_TOKEN_SPEC.id} replay failed: ${error.message}`)
        }
        throw error
      }
      expect(runtime.state.expectMatches).to.be.greaterThan(0)
      expect(runtime.state.lastError).to.equal(undefined)
    })
  })

  it('records dbg_cclient compressed↔compressed peer and replays', async () => {
    await withTempRoot(async (root) => {
      const recorded = await recordCompClientFixture(root)
      const listing = await fsp.readdir(recorded.sessionDir)
      expect(listing.some((f) => f === 'io.bin')).to.equal(true)

      const packed = join(root, 'dbg_cclient.waosrec')
      await packSession(recorded.sessionDir, packed, await resolveWaosrecBin())
      const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
      const dump = loadWaosrec(await readFile(packed), typeRegistry)
      expect(dump.bindings.bindings.length).to.be.greaterThan(1)

      const peerEntry = [...dump.registries.entries()].find(([k, v]) => {
        return k.endsWith('.0') && k !== `${dump.session.processId}.0` && v.length > 0
      })
      expect(peerEntry, 'peer USER registry present').to.not.equal(undefined)

      const runtime = await ReplayRuntime.create(dump)
      try {
        runtime.run()
      } catch (error) {
        if (error instanceof ReplayError) {
          expect.fail(`${DBG_CCLIENT_SPEC.id} replay failed: ${error.message}`)
        }
        throw error
      }
      expect(runtime.state.expectMatches).to.be.greaterThan(0)
      expect(runtime.state.lastError).to.equal(undefined)
    })
  })

  it('records dbg_mixed flat USER + compressed peer and replays', async () => {
    await withTempRoot(async (root) => {
      const recorded = await recordMixedFixture(root)
      const packed = join(root, 'dbg_mixed.waosrec')
      await packSession(recorded.sessionDir, packed, await resolveWaosrecBin())
      const typeRegistry = loadTypeRegistryFromBytes(await readFile(FIXTURE_REGISTRY))
      const dump = loadWaosrec(await readFile(packed), typeRegistry)
      expect(dump.bindings.bindings.length).to.be.greaterThan(1)

      const runtime = await ReplayRuntime.create(dump)
      try {
        runtime.run()
      } catch (error) {
        if (error instanceof ReplayError) {
          expect.fail(`${DBG_MIXED_SPEC.id} replay failed: ${error.message}`)
        }
        throw error
      }
      expect(runtime.state.expectMatches).to.be.greaterThan(0)
      expect(runtime.state.lastError).to.equal(undefined)
    })
  })
})
