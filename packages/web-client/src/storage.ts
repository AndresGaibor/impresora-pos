export interface TokenStore { get(): string | null; set(token: string): void; clear(): void; }
export function memoryTokenStore(): TokenStore { let token: string | null = null; return { get: () => token, set: value => { token = value; }, clear: () => { token = null; } }; }
