#!/usr/bin/env npx tsx
/**
 * Prepare e2e caches: session-echo, bad-echo.waosrec, dbg_topology.waosrec.
 * Invoked from Playwright globalSetup via tsx (same resolution as generate:recordings).
 */
import { access, constants as fsConstants, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  recordSampleFixture,
  recordTopologyFixture,
  packSession,
  corruptFirstExpectInSession,
  copySessionDir,
  withTempRoot,
  resolveWaosrecBin,
  SAMPLE_MODULE_SPECS,
} from '../ts-test/src/fixtureHarness.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(__dirname, '.cache')
const SESSION_ECHO = join(CACHE_DIR, 'session-echo')
const BAD_ECHO = join(CACHE_DIR, 'bad-echo.waosrec')
const RECORDINGS_DIR = join(__dirname, '../fixtures/recordings')
const TOPOLOGY_WAOSREC = join(RECORDINGS_DIR, 'dbg_topology.waosrec')

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

async function sessionHasFiles(dir: string): Promise<boolean> {
  if (!(await exists(dir))) return false
  return (
    (await exists(join(dir, 'io.bin'))) &&
    (await exists(join(dir, 'meta.bin'))) &&
    (await exists(join(dir, 'code.wasm')))
  )
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(RECORDINGS_DIR, { recursive: true })

  const needSession = !(await sessionHasFiles(SESSION_ECHO))
  const needBad = !(await exists(BAD_ECHO))
  const needTopology = !(await exists(TOPOLOGY_WAOSREC))

  if (!needSession && !needBad && !needTopology) {
    console.log('[e2e prepare-cache] cache ready')
    return
  }

  try {
    await resolveWaosrecBin()
  } catch (e) {
    console.warn('[e2e prepare-cache] skip:', e instanceof Error ? e.message : e)
    return
  }

  const echoSpec = SAMPLE_MODULE_SPECS.find((s) => s.id === 'dbg_echo')!

  if (needSession || needBad) {
    console.log('[e2e prepare-cache] recording dbg_echo session…')
    try {
      await withTempRoot(async (root) => {
        const recorded = await recordSampleFixture(root, echoSpec)
        if (needSession) {
          await copySessionDir(recorded.sessionDir, SESSION_ECHO)
          console.log('[e2e prepare-cache] wrote', SESSION_ECHO)
        }
        if (needBad) {
          await corruptFirstExpectInSession(recorded.sessionDir)
          await packSession(recorded.sessionDir, BAD_ECHO)
          console.log('[e2e prepare-cache] wrote', BAD_ECHO)
        }
      })
    } catch (e) {
      console.warn('[e2e prepare-cache] echo failed:', e instanceof Error ? e.message : e)
    }
  }

  if (needTopology) {
    console.log('[e2e prepare-cache] recording dbg_topology…')
    try {
      await withTempRoot(async (root) => {
        const recorded = await recordTopologyFixture(root)
        await packSession(recorded.sessionDir, TOPOLOGY_WAOSREC)
        console.log('[e2e prepare-cache] wrote', TOPOLOGY_WAOSREC)
      })
    } catch (e) {
      console.warn(
        '[e2e prepare-cache] topology failed:',
        e instanceof Error ? e.message : e
      )
    }
  }
}

main().catch((err) => {
  console.warn('[e2e prepare-cache] error:', err)
  // Soft-fail: specs that need cache will skip
  process.exit(0)
})
