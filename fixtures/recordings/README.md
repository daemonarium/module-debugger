# Sample recording fixtures

Generated `.waosrec` dumps for exercising the Recording UI (timeline, scrubber, hex, RPC decode, topology).

## Prerequisites

```bash
# From repo root
cmake -S . -B cmake-build-emscripten -DWASM=ON   # once
cmake --build cmake-build-emscripten --target \
  dbg_echo dbg_hello dbg_counter dbg_kv dbg_stats dbg_shop dbg_token \
  dbg_cpeer dbg_cclient dbg_mixed
cmake --build build --target waosrec   # or cmake-build-debug
```

## Generate

```bash
npm run generate:recordings -w @wa-os/module-debugger
```

Harness ends each session with recorder **`dump_and_clear`** (persist then clear the I/O window) so a later `dump_on_error` cannot append a duplicate window.

Writes:

- `dbg_*.waosrec` (gitignored — large binaries)
- `manifest.json` (committed metadata)

## Playwright UI e2e

```bash
npx playwright install chromium
npm run test:e2e -w @wa-os/module-debugger
```

`playwright.config` serves **`vite preview`** (not `vite dev`) to avoid ENOSPC from recursive `fs.watch` in the monorepo. `globalSetup` can refresh topology / bad-echo / session-echo caches when missing.

Release gate (includes mocha + e2e): [`TESTING.md`](../../../TESTING.md) → `npm run gate`.

## Open in UI

```bash
npm run dev -w @wa-os/module-debugger
```

Upload a `.waosrec` from this folder (Recording mode is the default). Default tab is **Messages**; use **Events** for the frame timeline.

## Samples

| id | Complexity | Notes |
|----|------------|-------|
| dbg_echo | 1 | Binary echo ×2 (host↔target shortcut) |
| dbg_hello | 2 | hello + fib |
| dbg_counter | 3 | Stateful counter |
| dbg_kv | 4 | put/get/keys |
| dbg_stats | 5 | Sample → Stats |
| dbg_shop | 6 | name/symbol/mint/balanceOf (in-process balances) |
| dbg_topology | 0 | Mid-session bind only (`allowZeroExpects`) |
| dbg_token | 7 | Flat token↔host + flat peer dbg_kv on sock 2 (shield topology) |
| dbg_cclient | 8 | Compressed USER + compressed peer `dbg_cpeer` |
| dbg_mixed | 9 | Flat USER + compressed peer `dbg_cpeer` |
