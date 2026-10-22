# module-debugger

A Vue app that opens a Daemonarium recording and replays it without a
live kernel. Upload a `.waosrec` or a session folder.

This repository is `daemonarium/module-debugger`. It is not an npm
package.

## Why it is a separate app

The kernel emits monitor events. `recorder` decides what to keep.
`debug-store` writes the session. This app reads the finished
`.waosrec`. It does not record, and it does not link those modules.

## Run

```
npm ci
npm run dev
```

Upload a `.waosrec`. The tabs are Events, Messages, API, and
Environment.

## Build

```
npm run type-check
npm run build
```

## Tests

`npm test` in `ts-test` is the headless unit suite. It does not need
Wasm.

`npm run test:stack` and `npm run generate:recordings` need
`extern/recorder-cpp`, `extern/kernel-shield-cpp`,
`extern/debug-store-cpp`, and `extern/rpc-cpp` built at `v0.1.0`.
Playwright (`npm run test:e2e`) needs those dumps plus Chromium.
None of that is the CI gate.

The replay path is in [docs/architecture.md](docs/architecture.md).
The frame and topology spec is in
[RECORDING_DEBUGGER.md](RECORDING_DEBUGGER.md).

## License

MIT. Upstream notices are in `NOTICE`. Conduct is in
`CODE_OF_CONDUCT.md`.
