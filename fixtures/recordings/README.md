# Sample recording fixtures

Generated `.waosrec` dumps for exercising the Recording UI (timeline, scrubber, hex, RPC decode, topology).

## Prerequisites

```bash
# From repo root
cmake -S . -B cmake-build-emscripten -DWASM=ON   # once
cmake --build cmake-build-emscripten --target dbg_echo dbg_hello dbg_counter dbg_kv dbg_stats dbg_shop dbg_token
cmake --build build --target waosrec
```

## Generate

```bash
npm run generate:recordings -w @wa-os/module-debugger
```

Writes:

- `dbg_*.waosrec` (gitignored — large binaries), including `dbg_topology.waosrec` (bind-only) and `dbg_token.waosrec` (shield + KV peer)
- `manifest.json` (committed metadata)

## Playwright UI e2e

```bash
npx playwright install chromium
npm run test:e2e -w @wa-os/module-debugger
```

See package README § UI e2e. `globalSetup` can refresh topology / bad-echo / session-echo caches when missing.

## Open in UI

```bash
npm run dev -w @wa-os/module-debugger
```

Upload a `.waosrec` from this folder (Recording mode is the default).

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
| dbg_token | 7 | **Typical topology**: token↔host, KERNEL_API↔shield, peer dbg_kv on sock 2 |
