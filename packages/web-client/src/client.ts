import { API_VERSION, CapabilitiesResponseSchema, HealthResponseSchema, PrintJobSchema, TEMPLATE_SCHEMA_VERSION, type PrintJob } from '@impresora-pos/contracts';
import { memoryTokenStore, type TokenStore } from './storage';
import { ImpresoraPosClientError } from './errors';

export class ImpresoraPosClient {
  private readonly baseUrl: string; private readonly tokenStore: TokenStore; private healthResponse?: ReturnType<typeof HealthResponseSchema.parse>;
  constructor(options: { origin: string; baseUrl?: string; tokenStore?: TokenStore; fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }) { this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:18181'; this.tokenStore = options.tokenStore ?? memoryTokenStore(); this.fetchImpl = options.fetch ?? fetch; this.origin = options.origin; }
  private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; private readonly origin: string;
  async health() { const health = await this.request('/v1/health', 'GET', false, HealthResponseSchema); if (health.apiVersion !== API_VERSION || health.templateSchemaVersion !== TEMPLATE_SCHEMA_VERSION) throw new ImpresoraPosClientError('API_INCOMPATIBLE', 'Agent API is incompatible'); this.healthResponse = health; return health; }
  capabilities() { return this.request('/v1/capabilities', 'GET', false, CapabilitiesResponseSchema); }
  async pair(code: string) { const result = await this.request('/v1/pair', 'POST', false, undefined, { pairingCode: code }); const token = (result as { token?: unknown }).token; if (typeof token !== 'string') throw new ImpresoraPosClientError('PAIRING_REQUIRED', 'Pairing did not return a token'); this.tokenStore.set(token); return { paired: true as const }; }
  print(job: PrintJob) { const valid = PrintJobSchema.parse(job); return this.request('/v1/print', 'POST', true, undefined, valid); }
  getJob(jobId: string) { return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, 'GET', true); }
  templates() { return this.request('/v1/templates', 'GET', false); }
  printerProfiles() { return this.request('/v1/printer-profiles', 'GET', false); }
  upsertManagedTemplate(template: unknown) { return this.request('/v1/managed-templates', 'PUT', true, undefined, template); }
  deleteManagedTemplate(id: string) { return this.request(`/v1/managed-templates/${encodeURIComponent(id)}`, 'DELETE', true); }
  openConfigurator() { return this.request('/v1/open-ui', 'POST', true, undefined, {}); }
  private async request<T>(path: string, method: string, auth: boolean, schema?: { parse(value: unknown): T }, body?: unknown): Promise<T> { if (method === 'POST' && path === '/v1/print' && !this.healthResponse) await this.health(); const headers: Record<string, string> = { Accept: 'application/json', Origin: this.origin }; if (body !== undefined) headers['Content-Type'] = 'application/json'; const token = auth ? this.tokenStore.get() : null; if (auth && !token) throw new ImpresoraPosClientError('PAIRING_REQUIRED', 'Pairing required'); if (token) headers.Authorization = `Bearer ${token}`; try { const init: RequestInit = { method, headers }; if (body !== undefined) init.body = JSON.stringify(body); const response = await this.fetchImpl(`${this.baseUrl}${path}`, init); const data: unknown = await response.json(); if (!response.ok) { const serverCode = typeof data === 'object' && data && 'code' in data && typeof data.code === 'string' ? data.code : undefined; throw new ImpresoraPosClientError(response.status === 401 ? 'PAIRING_REQUIRED' : path === '/v1/print' ? 'PRINT_REJECTED' : 'API_INCOMPATIBLE', 'Agent request failed', serverCode); } return schema ? schema.parse(data) : data as T; } catch (error) { if (error instanceof ImpresoraPosClientError) throw error; throw new ImpresoraPosClientError('AGENT_UNAVAILABLE', 'Agent unavailable'); } }
}
