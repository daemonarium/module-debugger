import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const RECORDINGS_DIR = join(__dirname, '../fixtures/recordings')
export const CACHE_DIR = join(__dirname, '.cache')
export const SESSION_ECHO_DIR = join(CACHE_DIR, 'session-echo')
export const BAD_ECHO_PATH = join(CACHE_DIR, 'bad-echo.waosrec')
export const DBG_ECHO_WASM = join(
  __dirname,
  '../../cmake-build-emscripten/examples/modules/dbg_echo.wasm'
)

export interface ManifestFixture {
  id: string
  file: string
  title: string
  complexity: number
  api: string[]
  expects: string[]
  notes?: string
  allowZeroExpects?: boolean
}

export interface Manifest {
  generatedAt: string
  fixtures: ManifestFixture[]
}

export function loadManifest(): Manifest {
  const path = join(RECORDINGS_DIR, 'manifest.json')
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

export function waosrecPath(idOrFile: string): string {
  const file = idOrFile.endsWith('.waosrec') ? idOrFile : `${idOrFile}.waosrec`
  return join(RECORDINGS_DIR, file)
}

export function requireWaosrec(id: string): string {
  const path = waosrecPath(id)
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Run: npm run generate:recordings -w @wa-os/module-debugger`
    )
  }
  return path
}

/** Fixtures that should pass Run with expectMatches ≥ 1 */
export function replayableFixtures(manifest: Manifest): ManifestFixture[] {
  return manifest.fixtures.filter(
    (f) => !f.allowZeroExpects && f.expects.includes('expect')
  )
}
