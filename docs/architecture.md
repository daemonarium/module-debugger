# Architecture

A `.waosrec` file is the pack of one debug-store session: manifest,
code, memory, events, bindings, and registries. `waosrec pack` in
[recorder-cpp](https://github.com/daemonarium/recorder-cpp) writes
that file. This app only reads it.

`ReplayRuntime` parses monitor frames with the generated registry
from `@daemonarium/kernel`. It decodes RPC payloads with
`@daemonarium/rpc`. No process is spawned, and the kernel is not
running.

The frame classes, BIND topology events, and on-disk mapping are in
[RECORDING_DEBUGGER.md](../RECORDING_DEBUGGER.md).
