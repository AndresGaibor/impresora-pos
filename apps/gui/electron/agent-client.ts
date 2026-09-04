import {
  DashboardSchema, DiagnosticsSchema, PairingCodeSchema, PrinterListSchema,
  ProfileListSchema, ProbeResultSchema, TemplateListSchema, TestPrintSchema,
  ProfileSchema, TemplateSchema, type AgentDashboard, type Diagnostics,
  type PrinterDevice, type PrinterProfile, type ProbeResult, type TemplateDefinition,
  TransportNameSchema,
} from '../src/app/agent-api';

export class AgentRequestError extends Error {
  readonly code = 'AGENT_REQUEST_FAILED';
  constructor() { super('Agent request failed'); }
}

interface AgentClientOptions {
  baseUrl?: string;
  adminToken: string;
  adminOrigin?: string;
  fetch?: typeof globalThis.fetch;
}

export const DEFAULT_ADMIN_ORIGIN = 'app://impresora-pos';

export class AgentClient {
  private readonly baseUrl: string;
  private readonly adminToken: string;
  private readonly adminOrigin: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: AgentClientOptions) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:18181';
    this.adminToken = options.adminToken;
    this.adminOrigin = options.adminOrigin ?? DEFAULT_ADMIN_ORIGIN;
    if (this.adminOrigin !== DEFAULT_ADMIN_ORIGIN && !/^https:\/\/[^/]+$/.test(this.adminOrigin)) {
      throw new Error('INVALID_ADMIN_ORIGIN');
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  getDashboard(): Promise<AgentDashboard> { return this.get('/admin/dashboard', DashboardSchema); }
  getProfiles(): Promise<PrinterProfile[]> { return this.get('/admin/profiles', ProfileListSchema); }
  getTemplates(): Promise<TemplateDefinition[]> { return this.get('/admin/templates', TemplateListSchema); }
  discoverPrinters(transport: 'system' | 'network' = 'network'): Promise<PrinterDevice[]> {
    return this.get(`/admin/printers/discover?transport=${transport}`, PrinterListSchema);
  }
  exportDiagnostics(limit = 20): Promise<Diagnostics> {
    return this.get(`/admin/diagnostics/recent?limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`, DiagnosticsSchema);
  }
  createPairingCode() { return this.post('/admin/pairing-codes', undefined, PairingCodeSchema); }
  probePrinter(device: PrinterDevice, transport: 'system' | 'network' = 'network'): Promise<ProbeResult> {
    return this.post('/admin/printers/probe', { transport, device }, ProbeResultSchema);
  }
  saveProfile(profile: PrinterProfile): Promise<PrinterProfile> {
    return this.put(`/admin/profiles/${encodeURIComponent(profile.id)}`, profile, ProfileSchema);
  }
  saveTemplate(template: TemplateDefinition): Promise<TemplateDefinition> {
    return this.put(`/admin/templates/${encodeURIComponent(template.id)}`, template, TemplateSchema);
  }
  submitTestPrint(profileId?: string) {
    return this.post('/admin/test-print', profileId ? { profileId } : {}, TestPrintSchema);
  }

  private async get<T>(path: string, schema: { parse(value: unknown): T }): Promise<T> {
    return this.request(path, { method: 'GET' }, schema);
  }
  private async post<T>(path: string, body: unknown, schema: { parse(value: unknown): T }): Promise<T> {
    return this.request(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, schema);
  }
  private async put<T>(path: string, body: unknown, schema: { parse(value: unknown): T }): Promise<T> {
    return this.request(path, { method: 'PUT', body: JSON.stringify(body) }, schema);
  }
  private async request<T>(path: string, init: RequestInit, schema: { parse(value: unknown): T }): Promise<T> {
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${this.adminToken}`);
      headers.set('Origin', this.adminOrigin);
      headers.set('Accept', 'application/json');
      if (init.body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new AgentRequestError();
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof AgentRequestError) throw error;
      throw new AgentRequestError();
    }
  }
}

export { TransportNameSchema };
