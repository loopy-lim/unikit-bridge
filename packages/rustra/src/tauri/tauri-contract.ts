import { normalizeUnikitError, UnikitCommandError, UnikitErrorCode } from '../types/index.js';
import type { TauriEngineOptions, TauriInvoke } from './index.js';

/** Share one successful startup handshake; a failed attempt can be retried. */
export function createTauriContractVerifier(invoke: TauriInvoke, options: TauriEngineOptions) {
  let verification: Promise<void> | undefined;
  const check = async () => {
    if (options.contractHash === undefined || options.contractVerification === 'off') return;
    try {
      let native: unknown;
      try {
        native = await invoke('unikit_contract_hash', { expectedHash: options.contractHash });
      } catch (error) {
        const normalized = normalizeUnikitError(error);
        if (
          normalized.code === UnikitErrorCode.ContractMismatch ||
          normalized.code === UnikitErrorCode.ContractUnenforceable
        )
          throw normalized;
        throw new UnikitCommandError(
          UnikitErrorCode.ContractUnenforceable,
          error === 'Command unikit_contract_hash not found'
            ? 'Tauri native endpoint unikit_contract_hash is not registered. Register the Rust package with unikit_bridge::tauri_support::register_with_events() and rebuild the host. A later .invoke_handler() replaces that registration; combine app commands with unikit_bridge::tauri_support::with_app_commands() instead.'
            : 'Tauri contract verification is unavailable. Rebuild the Rust host with the current Unikit registration helpers.',
          false,
          error,
        );
      }
      if (typeof native !== 'string' || native.trim() === '') {
        throw new UnikitCommandError(
          UnikitErrorCode.ContractUnenforceable,
          'Tauri unikit_contract_hash returned an invalid contract hash',
        );
      }
      if (native.trim() !== options.contractHash) {
        throw new UnikitCommandError(
          UnikitErrorCode.ContractMismatch,
          `Tauri contract hash mismatch: native="${native.slice(0, 16)}…" vs expected="${options.contractHash.slice(0, 16)}…". Regenerate the client and rebuild the Rust host.`,
        );
      }
    } catch (error) {
      if (options.contractVerification !== 'warn') throw error;
      console.warn(
        `[unikit] ${error instanceof Error ? error.message : String(error)} (contractVerification: 'warn' — continuing without strict verification)`,
      );
    }
  };
  return () => {
    verification ??= check().catch((error: unknown) => {
      verification = undefined;
      throw error;
    });
    return verification;
  };
}
