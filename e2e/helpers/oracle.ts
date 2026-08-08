import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ORACLE_DIR = join(__dirname, '../.cache/oracle')

export interface OracleFrame {
  typeName: string
  class: string
  payload: Uint8Array
  payloadLen: number
  offset: number
}

export interface Oracle {
  id: string
  file: string
  sessionName: string
  frames: OracleFrame[]
}

interface OracleJson {
  id: string
  file: string
  sessionName: string
  frames: Array<{
    typeName: string
    class: string
    payloadB64: string
    payloadLen: number
    offset: number
  }>
}

/** Load pre-dumped oracle JSON (from `scripts/dump-oracles.ts` / globalSetup). */
export function loadOracle(id: string): Oracle {
  const path = join(ORACLE_DIR, `${id}.json`)
  if (!existsSync(path)) {
    throw new Error(
      `Missing oracle ${path}. Ensure e2e globalSetup ran (dump-oracles) and .waosrec fixtures exist.`
    )
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as OracleJson
  return {
    id: raw.id,
    file: raw.file,
    sessionName: raw.sessionName,
    frames: raw.frames.map((f) => ({
      typeName: f.typeName,
      class: f.class,
      payload: Buffer.from(f.payloadB64, 'base64'),
      payloadLen: f.payloadLen,
      offset: f.offset,
    })),
  }
}

/** Same formatting as HexPane.vue (uppercase hex, space-separated, maxBytes). */
export function formatHexPreview(data: Uint8Array, maxBytes = 512): string {
  if (data.length === 0) return '(empty)'
  const slice = data.subarray(0, maxBytes)
  return Array.from(slice)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

export function countByClass(frames: OracleFrame[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of frames) {
    out[f.class] = (out[f.class] ?? 0) + 1
  }
  return out
}

export function expectFrameCount(frames: OracleFrame[]): number {
  return frames.filter((f) => f.class === 'expect').length
}

/** ASCII string → space-separated uppercase hex (as shown in HexPane). */
export function asciiToHexPreview(text: string): string {
  return formatHexPreview(new TextEncoder().encode(text))
}

export const ECHO_HELLO_HEX = asciiToHexPreview('hello-fixture')
export const ECHO_BINARY_HEX = formatHexPreview(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
