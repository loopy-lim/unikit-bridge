English | [한국어](./README.ko.md)

# @unikit/example-reference-app

The reference app for the `@unikit/react` hooks (useCommand/useMutation/useEvent/UnikitProvider) —
shows how to compose CRUD and event flows.

## Structure

```
src/
  App.tsx     UI tree using the hooks (platform-agnostic — swap the engine only)
  main.ts     Node entrypoint — runs the hook smoke against the real crud runtime
```

`App.tsx` consumes the codegen output at `../../crud/generated/commands.js` — the crud
example must be built first (see Run below).

## Run (Node Smoke)

```bash
# From the repo root
bun run test:app:reference
# Or directly:
cargo build -p unikit-crud-example && \
  tsc -p examples/reference-app/tsconfig.json && \
  node examples/reference-app/dist/examples/reference-app/src/main.js
```

The smoke test runs the real hook tree and verifies CRUD round-trips against the real
`unikit-crud-example` runtime over the Node process transport.

## Porting to Web/RN

The UI tree is identical anywhere — only the engine injection changes:

```tsx
// RN
const engine = createReactNativeEngine(NativeModules.UnikitJSI);
<UnikitProvider engine={engine}>
  <App />
</UnikitProvider>;

// Web (Tauri)
const engine = createTauriEngine({ invoke: window.__TAURI__.core.invoke });
<UnikitProvider engine={engine}>
  <App />
</UnikitProvider>;
```

### Channels are isomorphic across all 4 hosts

The reverse stream (`createChannel`) exposes the same `{ handle, close() }`
contract on all 4 hosts — inside a hook tree like `useMutation`, pass the
handle as a command argument and Rust pushes replies back. Only the issuer
differs per host:

```ts
// Node (loop-stdio) — createNodeChannel(loopTransport, cb)
// Bun (FFI) — createBunChannelBridge(options)(cb)
// Tauri — createChannel(cb) — approximate unicast (app.emit broadcast)
// RN (JSI) — createChannel(cb) — native C++ dispatcher direct
```

See the Channels row of the
[compatibility matrix](../../docs/compatibility-matrix.md) for per-host
support levels and differences.

## What It Proves

- `useCommand` — auto-runs on mount, re-runs when the input changes, minify-safe
  identification based on `commandId`
- `useMutation` — composes success/failure callbacks without optimistic updates
- `useEvent` — cleans up (unsubscribes) event subscriptions
- `UnikitProvider` — injects the engine scope
