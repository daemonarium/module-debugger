#!/usr/bin/env npx tsx
/**
 * Generate module-debugger/fixtures/recordings/*.waosrec for all dbg_* samples
 * plus dbg_topology (bind-only, allowZeroExpects).
 *
 * Prerequisites:
 *   cmake --build cmake-build-emscripten --target dbg_echo dbg_hello dbg_counter dbg_kv dbg_stats dbg_shop
 *   cmake --build build --target waosrec
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SAMPLE_MODULE_SPECS,
  recordSampleFixture,
  recordTopologyFixture,
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
