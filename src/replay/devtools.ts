import type { ReplayRuntime } from './runtime.js'
import type { ReplayState } from './runtime.js'
import type { DecodedFrame, RecordingDump } from './types.js'

export interface ReplayDevtools {
  step: () => boolean
  run: () => void
  seek: (index: number) => Promise<void>
  get state(): ReplayState
  get frames(): DecodedFrame[]
  get dump(): RecordingDump
}

declare global {
  // eslint-disable-next-line no-var
  var replay: ReplayDevtools | undefined
}

/**
 * Expose or clear `globalThis.replay` for browser DevTools stepping.
 * Optional `onChange` lets the Vue UI refresh when DevTools mutates runtime state.
 */
export function installReplayDevtools(
  rt: ReplayRuntime | null,
  onChange?: () => void
): void {
  if (!rt) {
    delete (globalThis as { replay?: ReplayDevtools }).replay
    return
  }
  const notify = () => {
    onChange?.()
  }
  const api: ReplayDevtools = {
    step: () => {
      const more = rt.step()
      notify()
      return more
    },
    run: () => {
      rt.run()
      notify()
    },
    seek: async (index: number) => {
      await rt.seek(index)
      notify()
    },
    get state() {
      return rt.state
    },
    get frames() {
      return rt.frames
    },
    get dump() {
      return rt.dump
    },
  }
  ;(globalThis as { replay?: ReplayDevtools }).replay = api
}
