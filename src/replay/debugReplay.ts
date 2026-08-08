import type { DecodedFrame } from './types.js'
import { num } from './types.js'

/**
 * Find process_data_event index for socket, searching from fromIndex forward.
 * If frames[fromIndex] is already that data event, returns fromIndex.
 */
export function resolveDataFrameIndex(
  frames: DecodedFrame[],
  fromIndex: number,
  socket: number
): number | null {
  const start = Math.max(0, Math.min(fromIndex, frames.length))
  for (let i = start; i < frames.length; i++) {
    const frame = frames[i]
    if (!frame) continue
    if (frame.typeName !== 'process_data_event') continue
    if (num(frame.header.socket) !== socket) continue
    return i
  }
  return null
}

export function formatPreviewValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') {
    if (value.length > 40) return JSON.stringify(value.slice(0, 37) + '...')
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Uint8Array) {
    return `binary[${value.length}]`
  }
  if (Array.isArray(value)) {
    return `array[${value.length}]`
  }
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      if (s && s.length > 48) return s.slice(0, 45) + '...'
      return s || '{}'
    } catch {
      return '{…}'
    }
  }
  return String(value)
}
