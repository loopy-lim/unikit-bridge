/**
 * @unikit/react — React and React Native hooks for unikit-bridge.
 *
 * Provides declarative data fetching (`useCommand`), mutations (`useMutation`),
 * event subscriptions (`useEvent`), and scoped engine context (`UnikitProvider`).
 *
 * @example
 * ```tsx
 * import { UnikitProvider, useCommand, useMutation } from '@unikit/react';
 * import { getItem, createItem } from './generated/commands.js';
 *
 * function ItemView({ id }: { id: string }) {
 *   const { data, loading, error, refetch } = useCommand(getItem, { id });
 *   const { mutate, loading: creating } = useMutation(createItem, {
 *     onSuccess: () => refetch(),
 *   });
 *
 *   if (loading) return <div>Loading...</div>;
 *   return <div>{data?.item?.name}</div>;
 * }
 * ```
 */

export { UnikitProvider, useUnikitEngine } from './context.js';
export type { UnikitProviderProps } from './context.js';

export { useCommand } from './useCommand.js';
export type {
  UseCommandOptions,
  UseCommandResult,
  CommandFn,
  VoidCommandFn,
} from './useCommand.js';

export { useMutation } from './useMutation.js';
export type { UseMutationOptions, UseMutationResult } from './useMutation.js';

export {
  useSuspenseCommand,
  invalidateCommands,
  configureSuspenseCache,
} from './useSuspenseCommand.js';
export type { SuspenseEntry, SuspenseCacheOptions } from './useSuspenseCommand.js';

export { useEvent } from './useEvent.js';
export type { EventCallback, UnsubscribeFn, SubscribeResult, SubscribeFn } from './useEvent.js';
