// ── unikit generated ────────────────────────────────────────
// File:   types.ts
// Source: schema.json (single source of truth for this file)
// Regen:  unikit codegen --config unikit.json
// Stage:  rust-probe schema → ts renderer
// DO NOT EDIT — changes will be overwritten and fail codegen --check.
// ────────────────────────────────────────────────────────────

export type { EngineClient, UnikitError } from '@unikit/types';
export { UnikitCommandError } from '@unikit/types';

export type GzipPayload = {
  data: Uint8Array | ArrayBuffer | number[];
};

export type UuidV7Input = Record<string, unknown>;

export type UuidV7Output = {
  /** 표준 하이픈 형식의 UUID v7 문자열(시간 정렬 가능). */
  value: string;
};
