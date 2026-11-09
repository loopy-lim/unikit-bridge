// ── unikit generated ────────────────────────────────────────
// File:   events.ts
// Source: schema.json (single source of truth for this file)
// Regen:  unikit codegen --config unikit.json
// Stage:  rust-probe schema → ts renderer
// DO NOT EDIT — changes will be overwritten and fail codegen --check.
// ────────────────────────────────────────────────────────────

/** 선언된 unikit 이벤트 이름 (Rust `PackageBuilder::event`). */
export type UnikitEventName = 'job.done' | 'progress.tick';

/** 이벤트 이름 → 페이로드 타입 매핑. */
export type UnikitEventPayloads = {
  'job.done': {
  jobId: string;
  steps: number | bigint;
};
  'progress.tick': {
  jobId: string;
  step: number | bigint;
  total: number | bigint;
};
};

/** 플랫폼 구독 함수 — RN `subscribeEvent` / Tauri 래퍼 등. */
export type SubscribeFn = <N extends UnikitEventName>(
  name: N,
  callback: (payload: UnikitEventPayloads[N]) => void,
) => (() => void) | Promise<() => void>;

/** 타입 안전 이벤트 구독 — 페이로드가 자동으로 좁혀진다. */
export function onUnikitEvent<N extends UnikitEventName>(
  subscribe: SubscribeFn,
  name: N,
  callback: (payload: UnikitEventPayloads[N]) => void,
): (() => void) | Promise<() => void> {
  return subscribe(name, callback as (payload: UnikitEventPayloads[N]) => void);
}
