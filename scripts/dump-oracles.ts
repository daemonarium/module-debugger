#!/usr/bin/env npx tsx
/**
 * Dump frame oracles for Playwright content-fidelity tests.
 * Writes e2e/.cache/oracle/<id>.json (Playwright cannot import src/replay directly).
 */
import { access, constants as fsConstants, mkdir, readdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadWaosrec,
  loadTypeRegistryFromBytes,
  parseMonitorFrames,
} from '../src/replay/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = join(__dirname, '../fixtures/recordings')
const OUT_DIR = join(__dirname, '../e2e/.cache/oracle')
const FIXTURE_REGISTRY = join(__dirname, '../fixtures/waosrec.rpc_description.bin')

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  if (!(await exists(RECORDINGS_DIR))) {
    console.warn('[dump-oracles] no recordings dir')
    return
  }
  const typeRegistry = loadTypeRegistryFromBytes(readFileSync(FIXTURE_REGISTRY))
  const names = (await readdir(RECORDINGS_DIR)).filter((n) => n.endsWith('.waosrec'))
  for (const name of names) {
    const id = name.replace(/\.waosrec$/, '')
    const bytes = new Uint8Array(readFileSync(join(RECORDINGS_DIR, name)))
    const dump = loadWaosrec(bytes, typeRegistry)
    const frames = parseMonitorFrames(dump.events)
    const out = {
      id,
      file: name,
      sessionName: dump.session.name,
      frames: frames.map((f) => ({
        typeName: f.typeName,
        class: f.class,
        payloadB64: Buffer.from(f.payload).toString('base64'),
        payloadLen: f.payload.length,
        offset: f.offset,
      })),
    }
    const outPath = join(OUT_DIR, `${id}.json`)
    await writeFile(outPath, JSON.stringify(out) + '\n')
    console.log('[dump-oracles] wrote', outPath, `(${frames.length} frames)`)
  }
}

main().catch((err) => {
  console.warn('[dump-oracles] error:', err)
  process.exit(0)
})
