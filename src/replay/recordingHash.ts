export type RecordingTab = 'events' | 'messages' | 'api' | 'environment'

export interface RecordingUiHash {
  tab: RecordingTab
  /** Selected stream message id */
  msg?: number
  /** Selected / seek frame index */
  frame?: number
  /** Environment focus socket */
  sock?: number
  /** Environment focus method owner type */
  owner?: string
  /** Environment focus method name */
  method?: string
}

const TABS = new Set<RecordingTab>(['events', 'messages', 'api', 'environment'])

function stripHash(raw: string): string {
  return raw.startsWith('#') ? raw.slice(1) : raw
}

export function parseRecordingHash(hash: string): RecordingUiHash | null {
  const body = stripHash(hash).trim()
  if (!body) return null
  const params = new URLSearchParams(body)
  const tabRaw = params.get('tab')
  if (!tabRaw || !TABS.has(tabRaw as RecordingTab)) return null
  const state: RecordingUiHash = { tab: tabRaw as RecordingTab }
  const msg = params.get('msg')
  if (msg !== null && msg !== '') {
    const n = Number(msg)
    if (Number.isFinite(n)) state.msg = n
  }
  const frame = params.get('frame')
  if (frame !== null && frame !== '') {
    const n = Number(frame)
    if (Number.isFinite(n)) state.frame = n
  }
  const sock = params.get('sock')
  if (sock !== null && sock !== '') {
    const n = Number(sock)
    if (Number.isFinite(n)) state.sock = n
  }
  const owner = params.get('owner')
  if (owner) state.owner = owner
  const method = params.get('method')
  if (method) state.method = method
  return state
}

export function serializeRecordingHash(state: RecordingUiHash): string {
  const params = new URLSearchParams()
  params.set('tab', state.tab)
  if (state.msg !== undefined) params.set('msg', String(state.msg))
  if (state.frame !== undefined) params.set('frame', String(state.frame))
  if (state.sock !== undefined) params.set('sock', String(state.sock))
  if (state.owner) params.set('owner', state.owner)
  if (state.method) params.set('method', state.method)
  return `#${params.toString()}`
}

export function hashesEqual(a: RecordingUiHash, b: RecordingUiHash): boolean {
  return serializeRecordingHash(a) === serializeRecordingHash(b)
}

export function readRecordingHash(): RecordingUiHash | null {
  if (typeof window === 'undefined') return null
  return parseRecordingHash(window.location.hash)
}

export function writeRecordingHash(
  state: RecordingUiHash,
  mode: 'push' | 'replace'
): void {
  if (typeof window === 'undefined') return
  const next = serializeRecordingHash(state)
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const url = `${window.location.pathname}${window.location.search}${next}`
  if (current === url) return
  if (mode === 'push') {
    window.history.pushState(state, '', url)
  } else {
    window.history.replaceState(state, '', url)
  }
}

export function clearRecordingHash(): void {
  if (typeof window === 'undefined') return
  const url = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', url)
}
