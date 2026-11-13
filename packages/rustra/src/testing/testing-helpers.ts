import { UnikitCommandError, normalizeUnikitError } from '../types/index.js';

export function toMockError(error: unknown): UnikitCommandError {
  if (error instanceof UnikitCommandError) return error;
  if (isUnikitErrorShape(error)) {
    return new UnikitCommandError(error.code, error.message, error.retryable);
  }
  if (typeof error === 'string') return normalizeUnikitError(error);
  if (error instanceof Error) return new UnikitCommandError('unknown', error.message);
  return new UnikitCommandError('unknown', String(error));
}

export function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      current.push(
        left[i] === right[j]
          ? previous[j]!
          : 1 + Math.min(previous[j]!, previous[j + 1]!, current[j]!),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function isUnikitErrorShape(
  e: unknown,
): e is { code: string; message: string; retryable?: boolean } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'message' in e &&
    typeof (e as { code: unknown }).code === 'string' &&
    typeof (e as { message: unknown }).message === 'string'
  );
}
