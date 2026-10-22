import { kernelApi } from '@daemonarium/kernel'

export interface SessionMetaView {
  name: string
  processId: number
  status: string
  error: string
  labels: Record<string, string>
}

export interface SnapshotMetaView {
  snapshotUid: number
  manaUsed: number
  manaLimit: number
  memorySize: number
}

export interface SocketBindingView {
  socket: number
  peerProcess: number
  peerSocket: number
  direction: number
}

export interface BindingsSnapshotView {
  processId: number
  bindings: SocketBindingView[]
}

export interface RecordingDump {
  formatVersion: number
  session: SessionMetaView
  anchor: SnapshotMetaView
  code: Uint8Array
  memory: Uint8Array
  events: Uint8Array
  bindings: BindingsSnapshotView
  registries: Map<string, Uint8Array>
}

export type FrameClass = 'stimulus' | 'expect' | 'topology' | 'anchor' | 'ignore'

export interface DecodedFrame {
  typeName: string
  header: Record<string, unknown>
  payload: Uint8Array
  offset: number
  class: FrameClass
}

export interface TopologyBinding {
  peerProcess: number
  peerSocket: number
  direction: number
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReplayError'
  }
}

export function registryKey(processId: number, socketId: number): string {
  return `${processId}.${socketId}`
}

export function num(v: unknown): number {
  if (typeof v === 'bigint') return Number(v)
  return Number(v)
}

export function isDirectionIn(dir: unknown): boolean {
  return num(dir) === kernelApi.direction.IN
}

export function isDirectionOut(dir: unknown): boolean {
  return num(dir) === kernelApi.direction.OUT
}
