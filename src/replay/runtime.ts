import { parseMonitorFrames, createMonitorCodecs } from './frames.js'
import { ReplayHost } from './host.js'
import {
  type DecodedFrame,
  type RecordingDump,
  type TopologyBinding,
  ReplayError,
  num,
  registryKey,
} from './types.js'

export interface ReplayState {
  index: number
  total: number
  topology: Map<number, TopologyBinding>
  registries: Map<string, Uint8Array>
  expectMatches: number
  lastError?: ReplayError
  stopped: boolean
}

export class ReplayRuntime {
  readonly dump: RecordingDump
  readonly frames: DecodedFrame[]
  host: ReplayHost
  readonly state: ReplayState
  private pendingOut: Map<number, Uint8Array[]>

  private constructor(
    dump: RecordingDump,
    host: ReplayHost,
    frames: DecodedFrame[],
    pendingOut: Map<number, Uint8Array[]>
  ) {
    this.dump = dump
    this.host = host
    this.frames = frames
    this.pendingOut = pendingOut
    const topology = new Map<number, TopologyBinding>()
    for (const b of dump.bindings.bindings) {
      topology.set(b.socket, {
        peerProcess: b.peerProcess,
        peerSocket: b.peerSocket,
        direction: b.direction,
      })
    }
    this.state = {
      index: 0,
      total: frames.length,
      topology,
      registries: new Map(dump.registries),
      expectMatches: 0,
      stopped: false,
    }
  }

  static async create(dump: RecordingDump): Promise<ReplayRuntime> {
    if (!dump.code.length) {
      throw new ReplayError('RecordingDump.code is empty')
    }
    if (!dump.memory.length) {
      throw new ReplayError('RecordingDump.memory is empty')
    }

    const { codecs } = createMonitorCodecs()
    const frames = parseMonitorFrames(dump.events, codecs)
    const { host, pendingOut } = await ReplayRuntime.createHost(dump)
    return new ReplayRuntime(dump, host, frames, pendingOut)
  }

  private static async createHost(dump: RecordingDump): Promise<{
    host: ReplayHost
    pendingOut: Map<number, Uint8Array[]>
  }> {
    const pendingOut = new Map<number, Uint8Array[]>()
    const host = await ReplayHost.create(
      dump.code,
      dump.memory,
      dump.anchor.manaUsed,
      dump.anchor.manaLimit,
      (socket, bytes) => {
        const q = pendingOut.get(socket) ?? []
        q.push(bytes)
        pendingOut.set(socket, q)
      }
    )
    return { host, pendingOut }
  }

  private resetStateFromBindings(): void {
    this.state.topology.clear()
    for (const b of this.dump.bindings.bindings) {
      this.state.topology.set(b.socket, {
        peerProcess: b.peerProcess,
        peerSocket: b.peerSocket,
        direction: b.direction,
      })
    }
    this.state.registries = new Map(this.dump.registries)
    this.state.index = 0
    this.state.expectMatches = 0
    this.state.lastError = undefined
    this.state.stopped = false
  }

  /**
   * Restore snapshot and replay frames [0, index). Clamped to [0, total].
   * On ReplayError, stops with lastError set (does not throw).
   */
  async seek(index: number): Promise<void> {
    const clamped = Math.max(0, Math.min(Math.floor(index), this.frames.length))
    const { host, pendingOut } = await ReplayRuntime.createHost(this.dump)
    this.host = host
    this.pendingOut = pendingOut
    this.resetStateFromBindings()
    while (this.state.index < clamped) {
      try {
        if (!this.step()) break
      } catch {
        break
      }
    }
  }

  step(): boolean {
    if (this.state.stopped || this.state.index >= this.frames.length) {
      this.state.stopped = true
      return false
    }
    const frame = this.frames[this.state.index]
    this.state.index += 1
    try {
      this.applyFrame(frame)
    } catch (error) {
      const err = error instanceof ReplayError
        ? error
        : new ReplayError(error instanceof Error ? error.message : String(error))
      this.state.lastError = err
      this.state.stopped = true
      throw err
    }
    return this.state.index < this.frames.length && !this.state.stopped
  }

  run(): void {
    while (this.step()) {
      /* continue */
    }
    if (this.state.lastError) {
      throw this.state.lastError
    }
  }

  private applyFrame(frame: DecodedFrame): void {
    switch (frame.class) {
      case 'stimulus':
        this.applyStimulus(frame)
        return
      case 'expect':
        this.applyExpect(frame)
        return
      case 'topology':
        this.applyTopology(frame)
        return
      case 'anchor':
        if (frame.typeName === 'process_error_event' || frame.typeName === 'process_killed_event') {
          this.state.stopped = true
        }
        return
      case 'ignore':
      default:
        return
    }
  }

  private applyStimulus(frame: DecodedFrame): void {
    const socket = num(frame.header.socket)
    switch (frame.typeName) {
      case 'process_copy_event':
        this.host.writeInput(socket, frame.payload)
        return
      case 'process_data_event':
        this.host.callSocketData(socket)
        return
      case 'process_drain_event':
        this.host.callSocketOutputDrain(socket)
        return
      case 'process_measure_mana_event':
        this.host.manaUsed = num(frame.header.new_mana ?? this.host.manaUsed)
        return
      case 'process_set_mana_limit_event':
        this.host.manaLimit = num(frame.header.mana_limit ?? this.host.manaLimit)
        return
      default:
        return
    }
  }

  private applyExpect(frame: DecodedFrame): void {
    const socket = num(frame.header.socket)
    const expected = frame.payload
    const q = this.pendingOut.get(socket) ?? []
    const actual = q.shift()
    this.pendingOut.set(socket, q)
    if (actual === undefined) {
      throw new ReplayError(
        `expected Copy OUT on socket ${socket} (${expected.length} bytes) but no flush captured`
      )
    }
    if (actual.length !== expected.length || !bytesEqual(actual, expected)) {
      throw new ReplayError(
        `Copy OUT mismatch on socket ${socket}: ` +
          `actual=${actual.length}b expected=${expected.length}b`
      )
    }
    this.state.expectMatches += 1
  }

  private applyTopology(frame: DecodedFrame): void {
    const socket = num(frame.header.socket)
    const peerProcess = num(frame.header.peer_process)
    const peerSocket = num(frame.header.peer_socket)
    const dir = num(frame.header.direction)
    if (frame.typeName === 'process_bind_event') {
      this.state.topology.set(socket, {
        peerProcess,
        peerSocket,
        direction: dir,
      })
      const key = registryKey(peerProcess, peerSocket)
      if (!this.state.registries.has(key)) {
        this.state.registries.set(key, new Uint8Array(0))
      }
      return
    }
    if (frame.typeName === 'process_unbind_event') {
      this.state.topology.delete(socket)
    }
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
