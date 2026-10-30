# Sample recording fixtures

Generated `.waosrec` dumps for exercising the Recording UI (timeline, scrubber, hex, RPC decode, topology).

## Prerequisites

Check out `extern/rpc-cpp`, `extern/recorder-cpp`, `extern/kernel-shield-cpp`, and `extern/debug-store-cpp` at `v0.1.0` and build them. Sample modules land in `extern/rpc-cpp/build-web/examples/modules`. `waosrec` lands in `extern/recorder-cpp/build/waosrec`.

## Generate

```bash
npm run generate:recordings
```

Harness ends each session with recorder **`dump_and_clear`** (persist then clear the I/O window) so a later `dump_on_error` cannot append a duplicate window. All generate paths use `dump_and_clear`.

Writes:

- 11× `dbg_*.waosrec` (gitignored — large binaries; see Samples)
- `manifest.json` (committed metadata)

`dbg_cpeer` is peer WASM only (needed to build `dbg_cclient` / `dbg_mixed`); it is **not** a fixture row.

## Playwright UI e2e

```bash
npx playwright install chromium
npm run test:e2e
```

`playwright.config` serves **`vite preview`** (not `vite dev`). `globalSetup` can refresh topology / bad-echo / session-echo caches when missing.

## Open in UI

```bash
npm run dev
```

Manual UI: `dev`. Playwright e2e: **`vite preview`** (via `playwright.config` webServer). Upload a `.waosrec` from this folder (Recording mode is the default). Default tab is **Messages**; use **Events** for the frame timeline.

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
| dbg_fail | 10 | `ok()` then `boom()` trap. Replay fails (`replayFails`). Not in the success e2e suite |
