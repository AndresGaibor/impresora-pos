import type { Database } from 'bun:sqlite';
import { PairingMetadataRepository } from '../db/repositories/pairings';
import { PrinterProfileRepository } from '../db/repositories/profiles';
import { TemplateRepository } from '../db/repositories/templates';
import { JobService } from '../jobs/job-service';
import { NetworkPrinterTransport } from '../transports/network';
import { Router, type Route } from './router';
import { PairingService } from './pairing';
import { RateLimiter } from './rate-limit';
import { createHealthRouter } from './routes/health';
import { createCatalogRouter } from './routes/catalog';
import { createPrintRouter } from './routes/print';
import { provisionAdminCredential } from './admin-auth';
import { createAdminProfilesRouter } from './routes/admin-profiles';
import { createAdminTemplatesRouter } from './routes/admin-templates';
import { createAdminDiagnosticsRouter } from './routes/admin-diagnostics';
import { createAdminDashboardRouter } from './routes/admin-dashboard';
import type { HealthComposition } from './routes/health';
import { SystemPrinterTransport } from '../transports/system';
import type { PrinterTransport } from '@impresora-pos/printer-core/src/types';
import { createAdminUpdateRouter } from './routes/admin-update';
import { initialUpdateState } from '../update/state';
import { createManagedTemplatesRouter } from './routes/managed-templates';
import { createOpenUiRouter } from './routes/open-ui';

export interface ServerDeps {
  hostname: string;
  port?: number;
  allowEphemeralPort?: boolean;
  db: Database;
  pairingRepo: PairingMetadataRepository;
  approvedOrigins: string[];
  rateLimiter?: RateLimiter;
  adminCredentialPath?: string;
  systemTransport?: PrinterTransport;
  networkTransport?: PrinterTransport;
  profileRepo?: PrinterProfileRepository;
  templateRepo?: TemplateRepository;
  jobService?: JobService;
}

export async function startServer(opts: ServerDeps): Promise<{ server: ReturnType<typeof Bun.serve>; port: number; pairingService: PairingService }> {
  if (opts.hostname !== '127.0.0.1') {
    throw new Error('Loopback binding requires hostname 127.0.0.1');
  }
  if (opts.port === 0 && !opts.allowEphemeralPort) {
    throw new Error('Ephemeral port requires allowEphemeralPort');
  }
  const rateLimiter = opts.rateLimiter ?? new RateLimiter();
  const pairingService = new PairingService(opts.pairingRepo);

  const profileRepo = opts.profileRepo ?? new PrinterProfileRepository(opts.db);
  const templateRepo = opts.templateRepo ?? new TemplateRepository(opts.db);

  const transport = opts.networkTransport ?? new NetworkPrinterTransport();
  const systemTransport = opts.systemTransport ?? new SystemPrinterTransport({ list: async () => [], probe: async () => ({ reachable: false }), print: async () => ({ success: false }) });
  const jobService = opts.jobService ?? new JobService({
    db: opts.db,
    profileRepo,
    templateRepo,
    transports: { network: transport, system: systemTransport },
  });

  const composition: HealthComposition = { profiles: profileRepo, transports: { network: transport, system: systemTransport } };
  const healthRouter = createHealthRouter(composition);
  const catalogRouter = createCatalogRouter(opts.db);
  const printRouter = createPrintRouter(opts.approvedOrigins, opts.pairingRepo, jobService, rateLimiter);
  const adminCredentialPath = opts.adminCredentialPath ?? '/tmp/impresora-pos-admin.token';
  provisionAdminCredential(opts.db, adminCredentialPath);
  if (!templateRepo.find('test-print-template')) templateRepo.save({ id: 'test-print-template', name: 'Test Print', type: 'test', content: 'TEST PRINT\n', source: 'builtin' });
  const pairingAdminRouter = createAdminDiagnosticsRouter(opts.db, opts.approvedOrigins, {
    system: systemTransport,
    network: transport,
  }, pairingService, jobService);
  const adminUpdateRouter = createAdminUpdateRouter(opts.db, opts.approvedOrigins, initialUpdateState());

  const mainRouter = new Router();

  for (const route of [...healthRouter.routes, ...catalogRouter.routes, ...printRouter.routes, ...createManagedTemplatesRouter(opts.db, opts.approvedOrigins, opts.pairingRepo).routes, ...createOpenUiRouter(opts.db, opts.approvedOrigins, opts.pairingRepo).routes, ...createAdminDashboardRouter(opts.db, opts.approvedOrigins, composition).routes, ...createAdminProfilesRouter(opts.db, opts.approvedOrigins).routes, ...createAdminTemplatesRouter(opts.db, opts.approvedOrigins).routes, ...pairingAdminRouter.routes, ...adminUpdateRouter.routes]) {
    mainRouter.add(route);
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: opts.hostname,
       port: opts.port ?? 18181,
      fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);
      const requestId = crypto.randomUUID();

      if (req.method === 'OPTIONS') {
        const origin = req.headers.get('Origin') ?? '';
        if (opts.approvedOrigins.includes(origin)) {
          return new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Max-Age': '86400',
            },
          });
        }
        return jsonError('FORBIDDEN_ORIGIN', 'Origin not allowed', requestId, 403);
      }

      const origin = req.headers.get('Origin') ?? '';
      const corsHeaders: Record<string, string> = {};
      if (opts.approvedOrigins.includes(origin)) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
      }

      const method = req.method;
      const pathname = url.pathname;

      if (pathname === '/v1/pair' && method === 'POST') {
        return handlePairing(req, origin, requestId, pairingService, rateLimiter, opts.approvedOrigins, corsHeaders);
      }

      if (pathname === '/v1/pair' && method === 'GET') {
        return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'GET not allowed', requestId }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

       if (pathname === '/v1/health' || pathname === '/v1/capabilities' || pathname === '/v1/templates' || pathname === '/v1/printer-profiles') {
        if (method === 'GET') {
          const response = mainRouter.handle(req);
          return response.then(r => {
            const rh = Object.fromEntries(r.headers.entries());
            return new Response(r.body, { status: r.status, headers: { ...rh, ...corsHeaders } });
          });
        }
        return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', requestId }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return mainRouter.handle(req).then(r => {
        const rh = Object.fromEntries(r.headers.entries());
        return new Response(r.body, { status: r.status, headers: { ...rh, ...corsHeaders } });
      });
      },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EADDRINUSE' || /address already in use|port is already in use/i.test(String(error))) {
      throw Object.assign(new Error(`Port ${opts.port} is already in use`), { code: 'PORT_IN_USE' });
    }
    throw error;
  }

  return { server, port: server.port as number, pairingService };
}

async function handlePairing(
  req: Request,
  origin: string,
  requestId: string,
  pairingService: PairingService,
  rateLimiter: RateLimiter,
  approvedOrigins: string[],
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!origin || !approvedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed', requestId }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const clientKey = `pairing:${origin}`;
  const { allowed } = rateLimiter.checkPairing(clientKey);
  if (!allowed) {
    return new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'Too many requests', requestId }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const bodyBytes = await req.arrayBuffer();
  if (bodyBytes.byteLength > 1024 * 1024) {
    return jsonError('BODY_TOO_LARGE', 'Request body too large', requestId, 413, corsHeaders);
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return jsonError('INVALID_JSON', 'Invalid JSON', requestId, 400, corsHeaders);
  }

  if (typeof body !== 'object' || body === null || typeof (body as { pairingCode?: unknown }).pairingCode !== 'string') {
    return jsonError('INVALID_REQUEST', 'pairingCode required', requestId, 400, corsHeaders);
  }

  const result = await pairingService.createToken((body as { pairingCode: string }).pairingCode, origin);
  if (!result) {
    return jsonError('INVALID_PAIRING_CODE', 'Invalid or expired pairing code', requestId, 401, corsHeaders);
  }

  return new Response(JSON.stringify({ token: result.token, requestId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function jsonError(code: string, message: string, requestId: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ code, message, requestId }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
