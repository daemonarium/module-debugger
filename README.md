# module-debugger

Vue 3 + Vite UI for inspecting WASM modules.

## Recording debugger (product focus)

- Spec: [`RECORDING_DEBUGGER.md`](./RECORDING_DEBUGGER.md) — dump replay without kernel, `.waosrec`, registries, BIND topology events
- Checklist: [`TODO.md`](./TODO.md)
- Headless runtime: [`src/replay/`](./src/replay/) — load session / `.waosrec`, apply stimulus, assert Copy OUT
- UI: full-height **app shell** in `App.vue` (Recording only; Interactive components are not mounted)

### Open a dump in the UI

```sh
npm run dev -w @wa-os/module-debugger
```

Then upload a `.waosrec` (or pick a session folder). Dump header + scrubber stay at the top; tabs fill the rest of the viewport. **Events**: timeline / hex. **Messages**: reassembled RPC wire messages (IN/OUT per socket) with jump back to events + `request_id` correlation, ValueTree parameter/return decode. **API**: browse all type registries / method signatures. **Environment**: expandable socket bindings with local/peer registry browsers. DevTools: `globalThis.replay`.

### Sample recording fixtures

**10** `.waosrec` fixtures (`dbg_echo`…`dbg_shop`, `dbg_topology`, `dbg_token`, `dbg_cclient`, `dbg_mixed`). Peer WASM **`dbg_cpeer`** is a build dependency for the compressed/mixed dumps, not a recording itself. Generate uses recorder **`dump_and_clear`**.

```sh
cmake --build cmake-build-emscripten --target \
  dbg_echo dbg_hello dbg_counter dbg_kv dbg_stats dbg_shop dbg_token \
  dbg_cpeer dbg_cclient dbg_mixed
cmake --build cmake-build-debug --target waosrec   # or build/ if that’s your tree
npm run generate:recordings -w @wa-os/module-debugger
```

See [`fixtures/recordings/README.md`](./fixtures/recordings/README.md). Open dumps via `npm run dev -w @wa-os/module-debugger`.

### Headless replay tests

From the repo root (needs a built recorder stack / WASM artifacts used by the e2e harness):

```sh
npm test -w @wa-os/module-debugger-tests
# or
npm test -w @wa-os/module-debugger
```

Coverage: frame/decode unit tests + e2e mock-module echo dump → `ReplayRuntime.run()` / `seek` OUT asserts.

### UI e2e (Playwright)

Automates Recording UI in Chromium (Interactive smoke specs are skipped while Interactive is hidden). Does **not** replace Mocha headless tests.

```sh
# Prerequisites
npm run generate:recordings -w @wa-os/module-debugger   # dbg_*.waosrec
npx playwright install chromium                         # once per machine

# From repo root or workspace
npm run test:e2e -w @wa-os/module-debugger
# Playwright UI mode:
npm run test:e2e:ui -w @wa-os/module-debugger
```

Uses **`vite preview`** (not `vite dev`) to avoid ENOSPC from recursive file watchers. `globalSetup` may also build `e2e/.cache/session-echo/`, `bad-echo.waosrec`, and `dbg_topology.waosrec` when missing (needs the same WASM / `waosrec` stack as generate).

**Content fidelity:** `recording.content.spec.ts` loads the same `.waosrec` in Node (`loadWaosrec` + `parseMonitorFrames`) and asserts the UI timeline/hex/`expect-matches` match that oracle 1:1 (plus golden `hello-fixture` / `DE AD BE EF` for `dbg_echo`).

**Local release gate** (mocha + Playwright + upstream suites): from repo root see [`TESTING.md`](../TESTING.md) → `npm run gate`. Optional `GATE_SKIP_E2E=1`. CI note: full generate is heavy (emscripten); do not block merge on missing `.waosrec` artifacts.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
yarn
```

### Compile and Hot-Reload for Development

```sh
yarn dev
```

### Type-Check, Compile and Minify for Production

```sh
yarn build
```
