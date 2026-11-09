English | [한국어](./README.ko.md)

# @unikit/testing

Provides a mock engine that runs generated TypeScript clients without a Rust backend, plus
contract gates. Component/hook tests can verify unikit commands without the native module.

## Install

```bash
bun add -d @unikit/testing
```

## createMockEngine

```ts
import { createMockEngine } from '@unikit/testing';
import { configure } from '@unikit/types';
import { addNumbers } from './generated/commands.js';

const engine = createMockEngine()
  .on('addNumbers', ({ a, b }) => ({ value: a + b }))
  .on('greet', ({ name }) => ({ message: `hello ${name}` }));

configure(engine);
const result = await addNumbers({ a: 20, b: 22 }); // { value: 42 }
```

`.mock()` registers a generated command function directly for type-safe registration
(safe even in minified environments — it reads the `commandId` embedded by codegen):

```ts
const engine = createMockEngine().mock(addNumbers, ({ a, b }) => ({ value: a + b }));
```

### Features

- **Call recording** — `engine.calls()` returns an array of `{ command, args, options }`.
  `options.signal`/`options.timeoutMs` are recorded too, so you can verify "was it called
  with a signal". Clear the record between cases with `engine.reset()`.
- **Mirrors the cancellation policy** — passing a pre-aborted signal rejects with
  `cancelled` (retryable), exactly like the real adapters.
- **invokeBatch** — processes batches by routing each entry to `invoke` (each entry's
  option policy applies as-is).
- **Error normalization** — if a handler throws a `{code, message}` shape, it is converted
  to `UnikitCommandError`.

## Contract gate

Detects drift between the command list in `schema.json` and the command list the client
exposes. Pairs with `unikit diff` (breaking changes between schema versions) in CI.

```ts
import { expectContractCurrent } from '@unikit/testing';
import schemaJson from './generated/schema.json' with { type: 'json' };
import * as commands from './generated/commands.js';

test('client matches schema.json', () => {
  // Throws with a human-readable message on drift; passes when in sync.
  expectContractCurrent(schemaJson, Object.keys(commands));
});
```

The pure-function form (`assertContractCurrent`) returns a result object
(`{missingInClient, missingInSchema}`) for use in custom checks.

## Related docs

- [Compatibility matrix](https://github.com/loopy-lim/unikit/blob/main/docs/compatibility-matrix.md)
- [Main README](https://github.com/loopy-lim/unikit#readme)
