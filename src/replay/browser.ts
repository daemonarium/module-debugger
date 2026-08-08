/**
 * Browser-safe barrel — do not import load.ts (Node fs) from Vue / Vite client.
 */
export type {
  RecordingDump,
  DecodedFrame,
  FrameClass,
  TopologyBinding,
  SessionMetaView,
  SnapshotMetaView,
  BindingsSnapshotView,
} from './types.js'
export { ReplayError, registryKey, num } from './types.js'
export {
  parseMonitorFrames,
  encodeMonitorFrame,
  classifyFrame,
  createMonitorCodecs,
} from './frames.js'
export {
  buildDumpFromSessionFiles,
  loadWaosrec,
  loadTypeRegistryFromBytes,
  deserializeTypedBytes,
  type SessionFileMap,
} from './sessionFiles.js'
export { loadWaosrecTypeRegistry } from './fixtures.js'
export { ReplayHost } from './host.js'
export { ReplayRuntime, type ReplayState } from './runtime.js'
export { installReplayDevtools, type ReplayDevtools } from './devtools.js'
export {
  decodeSocketPayload,
  decodeSocketPayloadWithRegistryBytes,
  resolveRegistryBytes,
  type DecodedSocketMessage,
  type DecodeSocketResult,
} from './decode.js'
