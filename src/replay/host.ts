import {
  ModuleSockets,
  ModuleSocket,
} from '@daemonarium/rpc'
import { ReplayError } from './types.js'

export type FlushHandler = (socket: number, bytes: Uint8Array) => void

function wasiImports(memory: WebAssembly.Memory): Record<string, Function> {
  const decoder = new TextDecoder()
  function readIovs(iovsPtr: number, iovsLen: number): string {
    const mem = new DataView(memory.buffer)
    const bytes = new Uint8Array(memory.buffer)
    let totalStr = ''
    for (let i = 0; i < iovsLen; i++) {
      const base = iovsPtr + i * 8
      const buf = mem.getUint32(base, true)
      const bufLen = mem.getUint32(base + 4, true)
      totalStr += decoder.decode(bytes.slice(buf, buf + bufLen))
    }
    return totalStr
  }
  return {
    fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
      const str = readIovs(iovsPtr, iovsLen)
      const mem = new DataView(memory.buffer)
      mem.setUint32(nwrittenPtr, new TextEncoder().encode(str).length, true)
      if (fd === 1 || fd === 2) {
        // ignore for determinism
        void str
      }
      return 0
    },
    fd_read(_fd: number, _iovsPtr: number, _iovsLen: number, nreadPtr: number): number {
      new DataView(memory.buffer).setUint32(nreadPtr, 0, true)
      return 0
    },
    fd_seek(_fd: number, _ol: number, _oh: number, _whence: number, newoffsetPtr: number): number {
      const mem = new DataView(memory.buffer)
      mem.setUint32(newoffsetPtr, 0, true)
      mem.setUint32(newoffsetPtr + 4, 0, true)
      return 0
    },
    fd_close(): number {
      return 0
    },
    environ_sizes_get(countPtr: number, bufSizePtr: number): number {
      const mem = new DataView(memory.buffer)
      mem.setUint32(countPtr, 0, true)
      mem.setUint32(bufSizePtr, 0, true)
      return 0
    },
    environ_get(): number {
      return 0
    },
  }
}

export class ReplayHost {
  readonly module: WebAssembly.Module
  readonly memory: WebAssembly.Memory
  instance?: WebAssembly.Instance
  moduleSockets?: ModuleSockets
  manaUsed = 0
  manaLimit = Number.MAX_SAFE_INTEGER
  /** When true, next callSocketData hits `debugger;` then clears the flag. */
  breakBeforeSocketData = false
  private onFlush: FlushHandler

  constructor(
    module: WebAssembly.Module,
    memory: WebAssembly.Memory,
    onFlush: FlushHandler
  ) {
    this.module = module
    this.memory = memory
    this.onFlush = onFlush
  }

  static async create(
    code: Uint8Array,
    memorySnapshot: Uint8Array,
    manaUsed: number,
    manaLimit: number,
    onFlush: FlushHandler
  ): Promise<ReplayHost> {
    const wasmModule = await WebAssembly.compile(code as unknown as BufferSource)
    const requiredPages = Math.max(1, Math.ceil(memorySnapshot.length / 65536))
    const maxPages = Math.max(requiredPages, 2048)
    const memory = new WebAssembly.Memory({ initial: requiredPages, maximum: maxPages })
    const host = new ReplayHost(wasmModule, memory, onFlush)
    host.manaUsed = manaUsed
    host.manaLimit = manaLimit > 0 ? manaLimit : Number.MAX_SAFE_INTEGER

    const imports: WebAssembly.Imports = {
      env: {
        memory,
        emscripten_notify_memory_growth: () => {},
      },
      waos: {
        waos_socket_flush: (socket: number) => host.handleFlush(socket),
        waos_socket_input_drain: (_socket: number) => {},
        waos_use_mana: (mana: number) => host.useMana(mana),
      },
    }

    const moduleImports = WebAssembly.Module.imports(wasmModule)
    if (moduleImports.some((i) => i.module === 'wasi_snapshot_preview1')) {
      imports.wasi_snapshot_preview1 = wasiImports(memory) as unknown as WebAssembly.ModuleImports
    }

    host.instance = await WebAssembly.instantiate(wasmModule, imports)

    const init = host.instance.exports._initialize as (() => void) | undefined
    if (init) init()
    const start = host.instance.exports.start as (() => void) | undefined
    if (start) start()

    // Snapshot is post-start; restore after init so socket buffers match the recording.
    const view = new Uint8Array(memory.buffer)
    if (memorySnapshot.length > view.length) {
      throw new ReplayError(
        `snapshot larger than memory (${memorySnapshot.length} > ${view.length})`
      )
    }
    view.set(memorySnapshot, 0)

    host.moduleSockets = await ModuleSockets.fromInstance(host.instance, memory)
    return host
  }

  useMana(mana: number): void {
    this.manaUsed += mana
    if (this.manaUsed > this.manaLimit) {
      throw new ReplayError(`mana limit exceeded: used=${this.manaUsed} limit=${this.manaLimit}`)
    }
  }

  getSocket(socket: number): ModuleSocket | undefined {
    const sock = this.moduleSockets?.getSocket(socket)
    if (sock instanceof ModuleSocket) return sock
    return undefined
  }

  writeInput(socket: number, payload: Uint8Array): void {
    const sock = this.getSocket(socket)
    if (!sock) {
      throw new ReplayError(`socket ${socket} not open for Copy IN`)
    }
    if (payload.length === 0) return
    if (sock.inputBuffer.writableBytes() < payload.length) {
      throw new ReplayError(
        `socket ${socket} input lacks space for ${payload.length} bytes ` +
          `(writable=${sock.inputBuffer.writableBytes()})`
      )
    }
    const written = sock.inputBuffer.write(payload, payload.length)
    if (written !== payload.length) {
      throw new ReplayError(`short write on socket ${socket} input (${written}/${payload.length})`)
    }
  }

  callSocketData(socket: number): void {
    if (!this.instance) throw new ReplayError('host not instantiated')
    const fn = this.instance.exports.waos_socket_data as ((s: number) => void) | undefined
    if (!fn) throw new ReplayError('waos_socket_data not exported')
    if (this.breakBeforeSocketData) {
      this.breakBeforeSocketData = false
      // eslint-disable-next-line no-debugger
      debugger
    }
    fn(socket)
  }

  callSocketOutputDrain(socket: number): void {
    if (!this.instance) throw new ReplayError('host not instantiated')
    const fn = this.instance.exports.waos_socket_output_drain as ((s: number) => void) | undefined
    if (!fn) throw new ReplayError('waos_socket_output_drain not exported')
    fn(socket)
  }

  private handleFlush(socket: number): void {
    const sock = this.getSocket(socket)
    if (!sock) return
    const readable = sock.outputBuffer.readableBytes()
    if (readable <= 0) {
      this.onFlush(socket, new Uint8Array(0))
      return
    }
    const bytes = new Uint8Array(readable)
    sock.outputBuffer.read(bytes, readable)
    this.onFlush(socket, bytes)
  }
}
