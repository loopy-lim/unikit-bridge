English | [한국어](./package-consolidation.ko.md)

# npm and crate consolidation (`@unikit-bridge/rustra`)

Starting with the **0.13.0** release line, all publishable TypeScript
adapters, React hooks, testing/devtools helpers, and the `unikit` CLI ship in
one npm package: **`@unikit-bridge/rustra`**. On crates.io, consumers depend on
**`unikit-bridge`** only (`unikit-bridge-macros` remains an internal
build-time dependency of the workspace).

The nine former `@unikit-bridge/*` packages, legacy `rustra` / `@rustra/*` npm
names, and helper crates `unikit-bridge-naming` / `rustra*` are superseded.
Registry deprecations point here; maintainers apply them with the script below.

## Install (new projects)

```bash
npm i @unikit-bridge/rustra@0.13.0
# or
bun add @unikit-bridge/rustra@0.13.0
```

Run the CLI via the package binary (same subcommands as before):

```bash
bunx --bun @unikit-bridge/rustra@0.13.0 init my-project --setup
# or, after install:
bunx unikit init my-project --setup
```

Import adapters and shared types through **subpath exports** (one dependency,
many entry points):

```ts
import { createNodeEngine } from '@unikit-bridge/rustra/node';
import type { EngineClient } from '@unikit-bridge/rustra/types';
import { createMockEngine } from '@unikit-bridge/rustra/testing';
```

Available subpaths: `./types`, `./node`, `./bun`, `./tauri`,
`./react-native`, `./react`, `./testing`, `./devtools`, `./cli`, plus
`./vite`, `./unikit.schema.json`, and granular `./cli/*` modules. The root
export (`@unikit-bridge/rustra`) re-exports `./types`.

## Rust consumers

In your application `Cargo.toml`, depend on the core crate only:

```toml
[dependencies]
unikit-bridge = "^0.13.0"
```

Do **not** add `unikit-bridge-macros` or `unikit-bridge-naming` in consumer
manifests — macros are pulled in by `unikit-bridge`; naming rules are inlined
in the workspace.

## Migration table — superseded npm packages

| Old package                   | New import / install                            |
| ----------------------------- | ----------------------------------------------- |
| `@unikit-bridge/types`        | `@unikit-bridge/rustra/types` (or package root) |
| `@unikit-bridge/node`         | `@unikit-bridge/rustra/node`                    |
| `@unikit-bridge/bun`          | `@unikit-bridge/rustra/bun`                     |
| `@unikit-bridge/tauri`        | `@unikit-bridge/rustra/tauri`                   |
| `@unikit-bridge/react-native` | `@unikit-bridge/rustra/react-native`            |
| `@unikit-bridge/react`        | `@unikit-bridge/rustra/react`                   |
| `@unikit-bridge/testing`      | `@unikit-bridge/rustra/testing`                 |
| `@unikit-bridge/devtools`     | `@unikit-bridge/rustra/devtools`                |
| `@unikit-bridge/cli`          | `@unikit-bridge/rustra` (bin: `unikit`)         |

Replace every `package.json` dependency on the old names with a single
`"@unikit-bridge/rustra": "^0.13.0"` (or the current line from
[compatibility-matrix.md](../compatibility-matrix.md)), then update imports and
re-run `unikit codegen --config unikit.json`. Generated files now emit
`@unikit-bridge/rustra/*` paths automatically.

## Migration table — legacy `rustra` npm scope

| Old package            | New                                     |
| ---------------------- | --------------------------------------- |
| `rustra`               | `@unikit-bridge/rustra`                 |
| `@rustra/types`        | `@unikit-bridge/rustra/types`           |
| `@rustra/node`         | `@unikit-bridge/rustra/node`            |
| `@rustra/bun`          | `@unikit-bridge/rustra/bun`             |
| `@rustra/tauri`        | `@unikit-bridge/rustra/tauri`           |
| `@rustra/react-native` | `@unikit-bridge/rustra/react-native`    |
| `@rustra/react`        | `@unikit-bridge/rustra/react`           |
| `@rustra/testing`      | `@unikit-bridge/rustra/testing`         |
| `@rustra/devtools`     | `@unikit-bridge/rustra/devtools`        |
| `@rustra/cli`          | `@unikit-bridge/rustra` (bin: `unikit`) |

Unpublished legacy package names are skipped safely when deprecating (404 OK).

## Migration table — superseded Rust crates

| Old crate              | Use instead                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `unikit-bridge-naming` | `unikit-bridge` (naming inlined)                               |
| `rustra`               | `unikit-bridge`                                                |
| `rustra-macros`        | `unikit-bridge-macros` (workspace only; not for app manifests) |
| `rustra-naming`        | `unikit-bridge`                                                |

## Maintainer deprecation tooling

From the repository root (dry-run by default):

```bash
node scripts/deprecate-legacy-packages.mjs
```

To call `npm deprecate` on packages that exist on the registry:

```bash
node scripts/deprecate-legacy-packages.mjs --apply
```

To print (or with `--apply`, run) `cargo yank` guidance for legacy crate
versions:

```bash
node scripts/deprecate-legacy-packages.mjs --crates --crate-version 0.13.0
node scripts/deprecate-legacy-packages.mjs --crates --crate-version 0.13.0 --apply
```

## Related docs

- [Getting started](../getting-started.md) — single-package install and scaffold
- [Release procedure](../release-procedure.md) — one npm publish surface
- [Crate and package structure](../dev/internal/crate-structure.md) — workspace layout
