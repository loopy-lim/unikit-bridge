import React, { createContext, useContext, type ReactNode } from 'react';
import type { EngineClient, InvokeOptions } from '../types/index.js';
import { getEngineRegistrationToken, invoke, UnikitCommandError } from '../types/index.js';

const UnikitContext = createContext<EngineClient | null>(null);

export interface UnikitProviderProps {
  engine: EngineClient;
  /** Optional to match React's createElement/conditional-composition ergonomics. */
  children?: ReactNode;
}

/**
 * Provides a scoped Unikit `EngineClient` to component subtree.
 */
export function UnikitProvider({ engine, children }: UnikitProviderProps): React.ReactElement {
  return React.createElement(UnikitContext.Provider, { value: engine }, children);
}

let defaultEngine: EngineClient | undefined;
let defaultRegistration: symbol | undefined;

/** Shared by components and Suspense retries within one global registration. */
export function getDefaultEngine(): EngineClient {
  const registration = getEngineRegistrationToken();
  if (!defaultEngine || registration !== defaultRegistration) {
    defaultRegistration = registration;
    defaultEngine = {
      invoke: <T>(command: string, args?: unknown, options?: InvokeOptions): Promise<T> => {
        if (registration !== getEngineRegistrationToken()) {
          return Promise.reject(
            new UnikitCommandError(
              'transport.unavailable',
              'The global engine was replaced; render with the current engine before invoking',
            ),
          );
        }
        return invoke<T>(command, args, options);
      },
    };
  }
  return defaultEngine;
}

/**
 * Returns the currently active `EngineClient`, either from `<UnikitProvider>` or
 * a default engine invoking the global `invoke` singleton.
 */
export function useUnikitEngine(): EngineClient {
  return useContext(UnikitContext) ?? getDefaultEngine();
}
