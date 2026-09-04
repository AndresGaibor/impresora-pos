const SCALAR_TYPES = new Set(['string', 'number', 'boolean']);

function isScalar(value: unknown): boolean {
  return value === null || SCALAR_TYPES.has(typeof value);
}

export const REDACTED = '[REDACTED]';

export function redact(obj: unknown): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') {
    return {};
  }

  const result: Record<string, unknown> = {};
  const source = obj as Record<string, unknown>;
  const allowedKeys = ['jobId', 'type', 'profileId', 'durationMs', 'state', 'errorCode'];

  for (const key of allowedKeys) {
    if (key in source) {
      const value = source[key];
      if (isScalar(value)) {
        result[key] = value;
      }
    }
  }

  return result;
}
