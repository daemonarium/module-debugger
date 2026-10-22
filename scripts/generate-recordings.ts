#!/usr/bin/env npx tsx
/**
 * Generate module-debugger/fixtures/recordings/*.waosrec for all dbg_* samples
 * plus dbg_topology, dbg_token, dbg_cclient (compressed↔compressed), dbg_mixed.
 *
 * Prerequisites: extern/rpc-cpp, extern/recorder-cpp, extern/kernel-shield-cpp,
 * and extern/debug-store-cpp built at v0.1.0. Sample wasm is under
 * extern/rpc-cpp/build-web/examples/modules. waosrec is
 * extern/recorder-cpp/build/waosrec.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
} from '../ts-test/src/fixtureHarness.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../fixtures/recordings')

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const waosrecBin = await resolveWaosrecBin()
  const fixtures: Array<Record<string, unknown>> = []

  for (const spec of SAMPLE_MODULE_SPECS) {
    console.log(`\n=== Generating ${spec.id} ===`)
    await withTempRoot(async (root) => {
      const recorded = await recordSampleFixture(root, spec)
      const outFile = `${spec.id}.waosrec`
      const outPath = join(OUT_DIR, outFile)
      await packSession(recorded.sessionDir, outPath, waosrecBin)
      console.log(`Wrote ${outPath}`)
      fixtures.push({
        id: spec.id,
        file: outFile,
        title: spec.title,
        complexity: spec.complexity,
        api: spec.api,
        expects: spec.expects,
        notes: spec.notes,
      })
    })
  }

  console.log(`\n=== Generating dbg_topology ===`)
  await withTempRoot(async (root) => {
    const recorded = await recordTopologyFixture(root)
    const outFile = 'dbg_topology.waosrec'
    const outPath = join(OUT_DIR, outFile)
    await packSession(recorded.sessionDir, outPath, waosrecBin)
    console.log(`Wrote ${outPath}`)
    fixtures.push({
      id: 'dbg_topology',
      file: outFile,
      title: 'Topology bind-only',
      complexity: 0,
      api: [],
      expects: ['topology'],
      notes: 'Mid-session bind without RPC; allowZeroExpects',
      allowZeroExpects: true,
    })
  })

  console.log(`\n=== Generating dbg_token (shield + dbg_kv peer) ===`)
  await withTempRoot(async (root) => {
    const recorded = await recordTokenKvFixture(root)
    const outFile = 'dbg_token.waosrec'
    const outPath = join(OUT_DIR, outFile)
    await packSession(recorded.sessionDir, outPath, waosrecBin)
    console.log(`Wrote ${outPath}`)
    fixtures.push({
      id: DBG_TOKEN_SPEC.id,
      file: outFile,
      title: DBG_TOKEN_SPEC.title,
      complexity: DBG_TOKEN_SPEC.complexity,
      api: DBG_TOKEN_SPEC.api,
      expects: DBG_TOKEN_SPEC.expects,
      notes: DBG_TOKEN_SPEC.notes,
    })
  })

  console.log(`\n=== Generating dbg_cclient (compressed ↔ compressed) ===`)
  await withTempRoot(async (root) => {
    const recorded = await recordCompClientFixture(root)
    const outFile = 'dbg_cclient.waosrec'
    const outPath = join(OUT_DIR, outFile)
    await packSession(recorded.sessionDir, outPath, waosrecBin)
    console.log(`Wrote ${outPath}`)
    fixtures.push({
      id: DBG_CCLIENT_SPEC.id,
      file: outFile,
      title: DBG_CCLIENT_SPEC.title,
      complexity: DBG_CCLIENT_SPEC.complexity,
      api: DBG_CCLIENT_SPEC.api,
      expects: DBG_CCLIENT_SPEC.expects,
      notes: DBG_CCLIENT_SPEC.notes,
    })
  })

  console.log(`\n=== Generating dbg_mixed (flat USER + compressed peer) ===`)
  await withTempRoot(async (root) => {
    const recorded = await recordMixedFixture(root)
    const outFile = 'dbg_mixed.waosrec'
    const outPath = join(OUT_DIR, outFile)
    await packSession(recorded.sessionDir, outPath, waosrecBin)
    console.log(`Wrote ${outPath}`)
    fixtures.push({
      id: DBG_MIXED_SPEC.id,
      file: outFile,
      title: DBG_MIXED_SPEC.title,
      complexity: DBG_MIXED_SPEC.complexity,
      api: DBG_MIXED_SPEC.api,
      expects: DBG_MIXED_SPEC.expects,
      notes: DBG_MIXED_SPEC.notes,
    })
  })

  const manifest = {
    generatedAt: new Date().toISOString(),
    fixtures,
  }
  const manifestPath = join(OUT_DIR, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nWrote ${manifestPath}`)
  console.log(`Done: ${fixtures.length} recordings in ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
