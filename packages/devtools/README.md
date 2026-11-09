English | [한국어](./README.ko.md)

# @unikit-bridge/devtools

An observability engine wrapper for unikit invocations. Wraps any `EngineClient` and
records call counts, error counts, and cumulative latency.

## Install

```bash
bun add @unikit-bridge/devtools
```

## createInstrumentedEngine

```ts
import { createInstrumentedEngine } from '@unikit-bridge/devtools';
import { configure } from '@unikit-bridge/types';
import { createNodeEngine } from '@unikit-bridge/node';

const engine = createInstrumentedEngine(createNodeEngine({ invoke: myTransport }));
configure(engine);

await addNumbers({ a: 1, b: 2 });
console.table(engine.report().commandStats);
// ┌─────────┬───────┬────────┬─────────┬────────┐
// │ (index) │ count │ errors │ totalMs │ avgMs  │
// ├─────────┼───────┼────────┼─────────┼────────┤
// │ addNum… │ 1     │ 0      │ 3       │ 3      │
// └─────────┴───────┴────────┴─────────┴────────┘
```

`report()` returns `{ totalCalls, commandStats, batchStats, slowest }`:

- `commandStats` — per-command `count`/`errors`/`totalMs`/`avgMs`
- `batchStats` — batch count/entry count/failure count/total and average latency. It does
  not guess at a specific command as the cause of a single batch failure.
- `slowest` — the 10 slowest calls (`{ command, ms }`)

## Behavioral contract

- **Transparent wrapping** — instrumentation never removes functionality. The options
  (signal/timeoutMs) of `invoke(command, args, options)` are passed to the inner engine
  as-is, and if the inner engine supports `invokeById`/`invokeBatch`, the wrapper forwards
  them too.
- **Timing** — prefers the monotonic high-resolution `performance.now()`, falling back to
  `Date.now()` only in embedded JS runtimes that lack that global.
- **Memory bound** — does not retain the full call history; keeps only the 10 slowest
  calls.

## Related docs

- [Compatibility matrix](https://github.com/loopy-lim/unikit-bridge/blob/main/docs/compatibility-matrix.md)
- [Main README](https://github.com/loopy-lim/unikit-bridge#readme)
