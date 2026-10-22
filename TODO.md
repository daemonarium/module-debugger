# Recording debugger — TODO

Checklist for the recording debugger track. Spec: [`RECORDING_DEBUGGER.md`](./RECORDING_DEBUGGER.md).

Mark items `[x]` only when the **done** criterion is met.

---

## 1. Spec

- [x] [`RECORDING_DEBUGGER.md`](./RECORDING_DEBUGGER.md) covers replay semantics (stimulus / expect / topology), `.waosrec` mapping, ReplayRuntime, UI direction, and recording pipeline (BIND events, registry APIs, store topology messages, recorder capture)
- [x] This `TODO.md` exists with phased checkboxes

**Done when:** both docs are in `module-debugger/` and linked from the package README.

---

## 2. Kernel monitor BIND

- [x] Add `monitor_flag.BIND = 1 << 13` in [rpc-cpp kernel.hpp](https://github.com/daemonarium/rpc-cpp/blob/v0.1.0/src/examples/structures/kernel.hpp) and [kernel-ts kernelApi.ts](https://github.com/daemonarium/kernel-ts/blob/v0.1.0/src/kernelApi.ts)
- [x] Add `process_bind_event` / `process_unbind_event` message types (fields: `socket`, `peer_process`, `peer_socket`, `direction`)
- [x] Emit from `kernel.bind` / `unbind` to monitors of **both** sides when `BIND` is set; before first related `Copy`
- [x] Wire through [kernel-ts ProcessMonitorEmitter.ts](https://github.com/daemonarium/kernel-ts/blob/v0.1.0/src/ProcessMonitorEmitter.ts) (+ any pump/bind call sites)
- [x] Unit tests: host bind while monitored → bind event on monitor socket; unbind → unbind event
- [x] Update [kernel-ts README](https://github.com/daemonarium/kernel-ts/blob/v0.1.0/README.md): remove outdated “bind needs no separate events”; document `BIND` and event table; add `BIND` to `RECORDING` preset

**Done when:** tests pass and README matches the emit contract in the spec.

---

## 3. Kernel API — bindings and registries

- [x] `list_socket_bindings(process_id) → vector<{ socket, peer_process, peer_socket, direction }>` from `socketConnections`
- [x] `get_rpc_description(process_id, socket_id) → binary`
  - ModuleProcess: `readRawRpcDescriptionOrEmpty(socket)` (not single-socket cache; soft empty on failure)
  - LocalProcess: `serializeTypeRegistry` or empty binary
- [x] Method ids appended at end of kernel RPC list; stubs / codegen updated
- [x] Tests: known bind graph listed; module with `rpc_description` returns non-empty bytes; missing → empty, no throw

**Done when:** ts-kernel tests cover both methods.

---

## 4. Kernel-shield pass-through

- [x] Expose `list_socket_bindings` and `get_rpc_description` on shield RPC ([kernel-shield-cpp kernel_rpc.hpp](https://github.com/daemonarium/kernel-shield-cpp/blob/v0.1.0/src/kernel_rpc.hpp), API, registration)
- [x] README + ts-test: calls reach kernel mock / real kernel

**Done when:** shield ts-test asserts both methods.

---

## 5. Debug-store topology messages + layout

- [x] `debug_bindings_event` + payload → `bindings.bin`; `debug_registry_event { process_id, socket_id }` + payload → `registry.<pid>.<sock>.bin`
- [x] Document files: `bindings.bin`, `registry.<pid>.<sock>.bin`
- [x] ts-test: send both messages, read back via fs; registry overwrite replaces file

**Done when:** store test writes and reads topology files.

---

## 6. Recorder capture + BIND refresh

- [x] Include `BIND` in monitor flags used for recording ([recorder-cpp DESIGN.md](https://github.com/daemonarium/recorder-cpp/blob/v0.1.0/DESIGN.md) + implementation)
- [x] After first complete save anchor: `list_socket_bindings` + `get_rpc_description` → `debug_bindings_event` / `debug_registry_event`
- [x] On `process_bind_event` / `process_unbind_event`: keep opaque frame in `io_bytes`; refresh peer registry via `debug_registry_event` on bind
- [x] Synthetic and/or e2e: files present after start; mid-session host bind → event in `io.bin` + new registry file

**Done when:** recorder e2e (or equivalent) asserts bindings + registry files and mid-session bind capture.

---

## 7. Packer `.waosrec`

- [x] Host passes target WASM in `start_recording.code` → store `code.wasm` via `debug_code_event` (no kernel/shield `get_code`)
- [x] Session side-cars are typed binary: `meta.bin`, `snap.*.meta.bin`, `bindings.bin`
- [x] Native CLI `waosrec pack|info` in recorder (`waosrec.hpp` format owner)
- [x] Round-trip / e2e: pack then sections readable (`code` non-empty when passed at start)

**Done when:** a known e2e session packs and sections parse.

---

## 8. ReplayRuntime + headless tests

- [x] Instantiate target, restore memory, apply stimulus, assert expect OUT
- [x] Topology events update decode map without calling bind in WASM
- [x] Headless test on real e2e dump (mock-module echo path)

**Done when:** headless replay of an e2e dump passes OUT assertions.

---

## 9. UI — Recording mode

- [x] Open `.waosrec` / session folder in module-debugger
- [x] Timeline (stimulus / expect / topology), scrubber, socket hex, RPC decode from registries
- [x] `globalThis.replay` hooks for DevTools stepping

**Done when:** manual open of a dump shows timeline and decode for at least one socket.

---

## 10. Legacy Interactive

- [x] Spec marks Interactive as legacy / not the current product focus
- [x] Interactive UI **hidden** from app shell (components kept; not mounted; e2e smoke skipped)
- [ ] Do **not** remove Interactive source unless a later task explicitly asks

**Done when:** Interactive code remains available for a possible future mount; Recording shell is the only product path.

---

## 11. UI e2e (Playwright)

- [x] Scaffold: `playwright.config.ts`, `e2e/` helpers, Vue `data-testid`s, `test:e2e` scripts
- [x] **P0** R01 shell + R10 open echo + R33 Run / expectMatches
- [x] **P1** timeline R20–R23, scrubber R30–R35, decode R40–R42, DevTools R70–R72
- [x] **P2** R44 all replayable manifest fixtures (serial Run)
- [x] **P3** errors R11/R12/R60/R61 + `dbg_topology` + R50–R52 (Environment tab)
- [x] **P4** directory picker R13/R14 + Interactive smoke skipped (UI hidden)
- [x] README e2e section
- [x] **Content fidelity** R80–R87: oracle from dump ↔ UI timeline/hex/exact expect-matches (+ echo golden payloads)
- [x] App shell + Environment tab e2e (no mode-select; `tab-environment` / `environment-*`)

**Done when:** `npm run test:e2e` is green locally with generated `.waosrec` fixtures.

---

## 12. Messages stream tab

- [x] `buildMessageStream` — reassemble length-prefixed RPC across Copy IN/OUT; span → frame indices
- [x] Unit tests (`messageStream.test.ts`)
- [x] UI: Events | Messages tabs; MessageStream + MessageDetail; jump to Events
- [x] Playwright smoke M01
- [x] Spec / README / TODO notes

**Done when:** opening `dbg_echo` / `dbg_shop` shows IN/OUT messages with decode and jump to contributing events.

---

## 13. RPC enrich + ValueTree

- [x] `rpcEnrich.ts` — decode trailing request/response/error payload; `request_id` map correlation
- [x] `rpcEnrich.test.ts` — synthetic + unknown function_id
- [x] `ValueTreeViewer.vue` — typed recursive expand/collapse value viewer
- [x] `TypeViewer.vue` compact mode + `MethodSignatureView.vue`
- [x] `MessageStream.vue` — req column, summary, color-coding pairs
- [x] `MessageDetail.vue` — RPC panel (arguments/return/error) via ValueTree
- [x] `DataView.vue` migration to ValueTree
- [x] Playwright M03-M05 + docs

**Done when:** Messages tab shows request_id colors and rich parameter trees instead of raw JSON.

---

## 14. App shell + Environment tab

- [x] `App.vue` — `h-screen` flex shell; Interactive mode switch removed / not mounted
- [x] `RecordingDebugger` — dump header bar; flex Tabs stretch; Events | Messages | API | Environment
- [x] Timeline / MessageStream / Detail — `flex-1` scroll (no `max-h-80`)
- [x] `RegistryTypeBrowser` shared by API + Environment
- [x] `EnvironmentView` — expandable bindings + local/peer registries + unbound section
- [x] Topology panel removed from layout; e2e R50–R52 / shell / Interactive skip updated
- [x] Docs: RECORDING_DEBUGGER / README / TODO

**Done when:** viewport fills; Environment shows expandable connections with registry browsers; shell e2e green.

---

## 15. Typical topology fixture (`dbg_token` ↔ `dbg_kv`)

- [x] `dbg_token` WASM — mint/balanceOf via peer RPC to `dbg_kv` on socket 2
- [x] Harness `setupTokenKvEnvironment` / `spawnAndWireViaShield` (register + KERNEL_API bind)
- [x] `recordTokenKvFixture` + generate + headless replay
- [x] Playwright R53 Environment asserts + fixtures README / TODO

**Done when:** Environment for `dbg_token.waosrec` shows host, shield KERNEL_API, and KV peer bindings with non-empty peer registry.

---

## 16. Compressed / mixed wire fixtures

- [x] Peer WASM `dbg_cpeer` (`WAOS_MODULE_RPC_COMPRESSED`) — DbgKv API for compressed clients
- [x] `dbg_cclient` — compressed USER + compressed peer; harness + generate + headless replay
- [x] `dbg_mixed` — flat USER + compressed peer; harness + generate + headless replay
- [x] Playwright content / fixtures-all cover `dbg_cclient` and `dbg_mixed`
- [x] Generate uses recorder `dump_and_clear`; fixtures README documents peer ≠ recording

**Done when:** both `.waosrec` fixtures decode in UI and pass mocha/e2e with mixed/compressed registries.
