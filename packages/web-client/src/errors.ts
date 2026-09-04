export type ClientErrorCode = 'AGENT_UNAVAILABLE' | 'PAIRING_REQUIRED' | 'LOCAL_NETWORK_PERMISSION_REQUIRED' | 'API_INCOMPATIBLE' | 'PRINT_REJECTED';
export class ImpresoraPosClientError extends Error { constructor(public readonly code: ClientErrorCode, message: string, public readonly serverCode?: string) { super(message); this.name = 'ImpresoraPosClientError'; } }
