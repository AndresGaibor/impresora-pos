export class SanitizedIpcError extends Error {
  readonly code = 'IPC_REQUEST_FAILED';

  constructor() {
    super('Request failed');
  }
}

export async function withSanitizedIpcErrors<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new SanitizedIpcError();
  }
}
