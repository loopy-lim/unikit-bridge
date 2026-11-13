[English](./package-consolidation.md) | 한국어

# npm·crate 통합 (`@unikit-bridge/rustra`)

**0.13.0** 릴리스 라인부터 TypeScript 어댑터, React 훅, testing/devtools,
`unikit` CLI가 단일 npm 패키지 **`@unikit-bridge/rustra`** 로 배포됩니다.
crates.io 소비자는 **`unikit-bridge`** 만 의존하면 됩니다(`unikit-bridge-macros`는
워크스페이스 내부 빌드용).

기존 9개 `@unikit-bridge/*` 패키지, 레거시 `rustra` / `@rustra/*` npm 이름,
`unikit-bridge-naming` / `rustra*` 크레이트는 대체되었습니다. 레지스트리
deprecation 메시지는 이 문서를 가리키며, 메인테이너는 아래 스크립트로 적용합니다.

## 설치 (신규 프로젝트)

```bash
npm i @unikit-bridge/rustra@0.13.0
# 또는
bun add @unikit-bridge/rustra@0.13.0
```

CLI는 패키지 바이너리로 실행합니다(서브커맨드는 이전과 동일):

```bash
bunx --bun @unikit-bridge/rustra@0.13.0 init my-project --setup
# 설치 후:
bunx unikit init my-project --setup
```

**서브패스 export** 로 어댑터·공유 타입을 가져옵니다(의존성 하나, 진입점 여러 개):

```ts
import { createNodeEngine } from '@unikit-bridge/rustra/node';
import type { EngineClient } from '@unikit-bridge/rustra/types';
import { createMockEngine } from '@unikit-bridge/rustra/testing';
```

서브패스: `./types`, `./node`, `./bun`, `./tauri`, `./react-native`,
`./react`, `./testing`, `./devtools`, `./cli`, `./vite`,
`./unikit.schema.json`, 세분 `./cli/*`. 루트(`@unikit-bridge/rustra`)는
`./types`를 재export합니다.

## Rust 소비자

애플리케이션 `Cargo.toml`에는 코어 크레이트만 둡니다:

```toml
[dependencies]
unikit-bridge = "^0.13.0"
```

소비자 manifest에 `unikit-bridge-macros`나 `unikit-bridge-naming`을 넣지
마세요. 매크로는 `unikit-bridge`가 끌어오고, naming 규칙은 워크스페이스에
인라인되었습니다.

## 마이그레이션 표 — 대체된 npm 패키지

| 이전 패키지                   | 새 import / 설치                                 |
| ----------------------------- | ------------------------------------------------ |
| `@unikit-bridge/types`        | `@unikit-bridge/rustra/types` (또는 패키지 루트) |
| `@unikit-bridge/node`         | `@unikit-bridge/rustra/node`                     |
| `@unikit-bridge/bun`          | `@unikit-bridge/rustra/bun`                      |
| `@unikit-bridge/tauri`        | `@unikit-bridge/rustra/tauri`                    |
| `@unikit-bridge/react-native` | `@unikit-bridge/rustra/react-native`             |
| `@unikit-bridge/react`        | `@unikit-bridge/rustra/react`                    |
| `@unikit-bridge/testing`      | `@unikit-bridge/rustra/testing`                  |
| `@unikit-bridge/devtools`     | `@unikit-bridge/rustra/devtools`                 |
| `@unikit-bridge/cli`          | `@unikit-bridge/rustra` (bin: `unikit`)          |

`package.json`의 옛 이름 의존성을 `"@unikit-bridge/rustra": "^0.13.0"` 하나로
바꾼 뒤 import를 고치고 `unikit codegen --config unikit.json`을 다시 실행하세요.
생성물은 자동으로 `@unikit-bridge/rustra/*` 경로를 씁니다.

## 마이그레이션 표 — 레거시 `rustra` npm scope

| 이전 패키지            | 새                                      |
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

미발행 레거시 이름은 deprecation 시 404로 건너뜁니다.

## 마이그레이션 표 — 대체된 Rust 크레이트

| 이전 크레이트          | 대신                                       |
| ---------------------- | ------------------------------------------ |
| `unikit-bridge-naming` | `unikit-bridge` (naming 인라인)            |
| `rustra`               | `unikit-bridge`                            |
| `rustra-macros`        | `unikit-bridge-macros` (워크스페이스 전용) |
| `rustra-naming`        | `unikit-bridge`                            |

## 메인테이너 deprecation 도구

저장소 루트(기본 dry-run):

```bash
node scripts/deprecate-legacy-packages.mjs
```

레지스트리에 있는 패키지에 `npm deprecate` 실행:

```bash
node scripts/deprecate-legacy-packages.mjs --apply
```

레거시 crate `cargo yank` 안내(또는 `--apply` 시 실행):

```bash
node scripts/deprecate-legacy-packages.mjs --crates --crate-version 0.13.0
node scripts/deprecate-legacy-packages.mjs --crates --crate-version 0.13.0 --apply
```

## 관련 문서

- [시작하기](../getting-started.ko.md)
- [릴리스 절차](../release-procedure.ko.md)
- [크레이트·패키지 구조](../dev/internal/crate-structure.ko.md)
