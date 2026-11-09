// JS wrapper for the UnikitWasmSpike native module.
import { NativeModules, Platform } from 'react-native';

type BytesHexResult = { hex: string; ms: number };

type SwapResult = {
  engineVersion: number;
  contractHash: string;
  instantiateMs: number;
  path: string;
};

type UnikitWasmSpikeModuleType = {
  loadBundledEngine(): Promise<{
    engineVersion: number;
    contractHash: string;
    instantiateMs: number;
    path: string;
  }>;
  reloadWasm(newPath: string): Promise<{
    engineVersion: number;
    contractHash: string;
    instantiateMs: number;
    path: string;
  }>;
  /** iOS: re-instantiate from Documents/engine_v2.wasm (adb/simctl-pushed). */
  reloadWasmFromDocuments?(): Promise<SwapResult>;
  /** Android: re-instantiate from filesDir/engine_v2.wasm (adb-pushed). */
  reloadWasmFromAppFiles?(): Promise<SwapResult>;
  evalCommandWasm(bytes: number[]): Promise<BytesHexResult>;
  evalCommandNative(bytes: number[]): Promise<BytesHexResult>;
  makeEnvelope(
    command: string,
    argsJson: string,
  ): Promise<{ hex: string; bytes: number[] }>;
};

const NativeUnikitWasmSpike = NativeModules.UnikitWasmSpikeModule as
  UnikitWasmSpikeModuleType | undefined;

export const spikeAvailable = Boolean(NativeUnikitWasmSpike);

/** Envelope built natively (single source of truth for byte construction). */
export async function makeEnvelope(
  command: string,
  argsJson: string,
): Promise<number[]> {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  const { bytes } = await NativeUnikitWasmSpike.makeEnvelope(command, argsJson);
  return bytes;
}

export async function loadBundledEngine() {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  return NativeUnikitWasmSpike.loadBundledEngine();
}

export async function reloadWasm(newPath: string) {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  return NativeUnikitWasmSpike.reloadWasm(newPath);
}

/** Platform-appropriate swap: push engine_v2.wasm first, then call this. */
export async function reloadSwappedEngine(): Promise<SwapResult> {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  const m = NativeUnikitWasmSpike;
  if (Platform.OS === 'ios' && m.reloadWasmFromDocuments)
    return m.reloadWasmFromDocuments();
  if (Platform.OS === 'android' && m.reloadWasmFromAppFiles)
    return m.reloadWasmFromAppFiles();
  throw new Error('no swap reload method on this platform');
}

export async function evalCommandWasm(
  bytes: number[],
): Promise<BytesHexResult> {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  return NativeUnikitWasmSpike.evalCommandWasm(bytes);
}

export async function evalCommandNative(
  bytes: number[],
): Promise<BytesHexResult> {
  if (!NativeUnikitWasmSpike)
    throw new Error('UnikitWasmSpike native module unavailable');
  return NativeUnikitWasmSpike.evalCommandNative(bytes);
}
