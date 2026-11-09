import { createFrameEngine as createBaseEngine } from '@unikit-bridge/types';
import type { EngineClient, UnikitNative } from '@unikit-bridge/types';
import { GENERATED_CONTRACT_HASH, SCHEMA_VERSION } from '../../../calculator/generated/contract';
import { frameRegistry } from '../../../calculator/generated/frame-registry';

export { frameRegistry };

export const createFrameEngine = (
  native: UnikitNative,
  registry: Map<string, import('@unikit-bridge/types').FrameCodec<any, any>> = frameRegistry,
): EngineClient =>
  createBaseEngine(native, registry, {
    contractHash: GENERATED_CONTRACT_HASH,
    schemaVersion: SCHEMA_VERSION,
  });
