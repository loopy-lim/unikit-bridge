/** @unikit-bridge/bun — Bun JSON transport and FFI adapter. */
export type {
  EngineClient,
  BootstrapState,
  UnikitError,
  FrameCodec,
  FrameNative,
  FrameEngineOptions,
  InvokeOptions,
  FrameEngine,
  EngineSupports,
} from '@unikit-bridge/types';
export {
  UnikitCommandError,
  configure,
  configureLazy,
  disposedBootstrapError,
  ensureConfigured,
  invoke,
  createFrameEngine,
  createJsonEngine,
} from '@unikit-bridge/types';
import { createJsonEngine } from '@unikit-bridge/types';
import { BUN_ENGINE_SUPPORTS } from './bun-ffi.js';
export { BUN_ENGINE_SUPPORTS, BUN_FRAME_ENGINE_SUPPORTS } from './bun-ffi.js';

export type BunInvokeTransport = {
  // T | unknown ≡ unknown 동치지만 api-surface 스냅샷 계약이라 원형을 유지한다.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 스냅샷 고정(재생성 태스크가 인수할 때 정리)
  invoke(command: string, args?: unknown): Promise<unknown> | unknown;
};

export function createBunEngine(transport: BunInvokeTransport) {
  return createJsonEngine((command, args) => transport.invoke(command, args), undefined, {
    ...BUN_ENGINE_SUPPORTS,
  });
}

export type { BunFfiEngineOptions, BunFfiRuntime } from './bun-ffi-library.js';
export { createBunFfiEngine, createBunBootstrap } from './bun-ffi.js';
export type { BunBootstrap } from './bun-ffi.js';
export type { BunEventBridge, BunEventBridgeOptions, BunEventDrainSource } from './bun-events.js';
export { createBunEventBridge } from './bun-events.js';
export type {
  BunEventSubscription,
  BunEventSubscriptionOptions,
} from './bun-event-subscription.js';
export { createBunEventSubscription } from './bun-event-subscription.js';
export type { BunChannel, BunChannelCallback, BunChannelBytesCallback } from './bun-channels.js';
export { createBunChannelBridge, createBunChannelBytesBridge } from './bun-channels.js';
