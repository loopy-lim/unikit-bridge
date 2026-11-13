import { createFrameEngine as createBaseEngine } from '@unikit-bridge/rustra/types';
import type { EngineClient, UnikitNative } from '@unikit-bridge/rustra/types';
import { GENERATED_CONTRACT_HASH, SCHEMA_VERSION } from '../../../calculator/generated/contract';
import { frameRegistry } from '../../../calculator/generated/frame-registry';

export { frameRegistry };

export const createFrameEngine = (
  native: UnikitNative,
  registry: Map<string, import('@unikit-bridge/rustra/types').FrameCodec<any, any>> = frameRegistry,
): EngineClient =>
  createBaseEngine(native, registry, {
    contractHash: GENERATED_CONTRACT_HASH,
    schemaVersion: SCHEMA_VERSION,
  });
