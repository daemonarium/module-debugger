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

- [x] Add `monitor_flag.BIND = 1 << 13` in [`kernel.hpp`](../cpp-rpc/src/examples/structures/kernel.hpp) and [`kernelApi.ts`](../ts-kernel/src/kernelApi.ts)
- [x] Add `process_bind_event` / `process_unbind_event` message types (fields: `socket`, `peer_process`, `peer_socket`, `direction`)
- [x] Emit from `kernel.bind` / `unbind` to monitors of **both** sides when `BIND` is set; before first related `Copy`
- [x] Wire through [`ProcessMonitorEmitter.ts`](../ts-kernel/src/ProcessMonitorEmitter.ts) (+ any pump/bind call sites)
- [x] Unit tests: host bind while monitored → bind event on monitor socket; unbind → unbind event
- [x] Update [`ts-kernel/README.md`](../ts-kernel/README.md): remove outdated “bind needs no separate events”; document `BIND` and event table; add `BIND` to `RECORDING` preset

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

- [x] Expose `list_socket_bindings` and `get_rpc_description` on shield RPC ([`kernel_rpc.hpp`](../kernel-shield/src/kernel_rpc.hpp), API, registration)
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

- [x] Include `BIND` in monitor flags used for recording ([`DESIGN.md`](../recorder/DESIGN.md) + implementation)
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

- [ ] Open `.waosrec` / session folder in module-debugger
- [ ] Timeline (stimulus / expect / topology), scrubber, socket hex, RPC decode from registries
- [ ] `globalThis.replay` hooks for DevTools stepping

**Done when:** manual open of a dump shows timeline and decode for at least one socket.

---

## 10. Legacy Interactive

- [x] Spec marks Interactive as legacy / not the current product focus
- [ ] Do **not** remove or rewrite Interactive UI unless a later task explicitly asks

**Done when:** Interactive still works for load-module + call method; no new Interactive features required for this track.
