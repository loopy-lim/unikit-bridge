// ── unikit generated ────────────────────────────────────────
// File:   frame-registry.ts
// Source: schema.json (single source of truth for this file)
// Regen:  unikit codegen --config unikit.json
// Stage:  schema → ts codec renderer
// DO NOT EDIT — changes will be overwritten and fail codegen --check.
// ────────────────────────────────────────────────────────────

import { jobStatusCodec, startJobCodec } from './frame-codecs.js';

export const frameRegistry = new Map<string, import('@unikit-bridge/types').FrameCodec<any, any>>([
  // route: postcard
  ['jobStatus', jobStatusCodec],
  // route: postcard
  ['startJob', startJobCodec],
]);
