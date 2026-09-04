import { Router } from '../router';
import { readAdminJson, verifyAdminRequest } from '../admin-auth';
import { JobMetadataRepository } from '../../db/repositories/jobs';
import type { PrinterTransport } from '@impresora-pos/printer-core/src/types';
import type { Database } from 'bun:sqlite';
import { PairingService } from '../pairing';
import { JobService } from '../../jobs/job-service';

const reply = (body: unknown, status = 200) => {
  const value = body as Record<string, unknown>;
  const normalized = typeof value?.code === 'string'
    ? { ...value, message: value.message ?? value.code, requestId: value.requestId ?? crypto.randomUUID() }
    : body;
  return new Response(JSON.stringify(normalized), { status, headers: { 'Content-Type': 'application/json' } });
};
export function createAdminDiagnosticsRouter(db: Database, origins: string[], transports: Record<string, PrinterTransport>, pairing: PairingService, jobs: JobService): Router {
  const router = new Router(); const auth = (req: Request) => verifyAdminRequest(req, db, origins);
  router.add({ method: 'GET', path: '/admin/printers/discover', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); const transport = transports[new URL(req.url).searchParams.get('transport') ?? 'network']; if (!transport) return reply({ code: 'INVALID_TRANSPORT' }, 422); return reply(await transport.discover()); } });
   router.add({ method: 'POST', path: '/admin/printers/probe', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const parsed = await readAdminJson(req); if (!parsed.ok) return reply({ code: parsed.code, message: parsed.message, requestId: crypto.randomUUID() }, parsed.status); const body = parsed.value as { transport?: string; device?: Parameters<PrinterTransport['probe']>[0] }; const transport = transports[body.transport ?? 'network']; if (!transport || !body.device) return reply({ code: 'INVALID_REQUEST', requestId: crypto.randomUUID() }, 422); return reply(await transport.probe(body.device)); } });
   router.add({ method: 'POST', path: '/admin/pairing-codes', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const origin = req.headers.get('Origin') ?? ''; if (!origins.includes(origin)) return reply({ code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed', requestId: crypto.randomUUID() }, 403); const code = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'); pairing.registerPairingCode(code, origin); return reply({ pairingCode: code }, 201); } });
   router.add({ method: 'POST', path: '/admin/test-print', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const parsed = await readAdminJson(req); if (!parsed.ok) return reply({ code: parsed.code, message: parsed.message, requestId: crypto.randomUUID() }, parsed.status); const body = parsed.value as { profileId?: string }; try { const status = await jobs.submit({ jobId: crypto.randomUUID(), type: 'test', templateId: 'printer-diagnostic-v1', profileId: body.profileId ?? 'p1', payload: { title: 'Printer diagnostic', lines: [] } }); return reply(status, 202); } catch (e) { return reply({ code: 'PRINT_ERROR', message: e instanceof Error ? e.message : 'Print failed', requestId: crypto.randomUUID() }, 500); } } });
  router.add({ method: 'GET', path: '/admin/diagnostics/recent', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); const raw = Number(new URL(req.url).searchParams.get('limit') ?? 20); const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 20; const rows = new JobMetadataRepository(db).recent(limit); return reply(rows.map(j => ({ jobId: j.jobId, type: j.type, profileId: j.profileId, state: j.state, createdAt: j.createdAt, updatedAt: j.updatedAt, durationMs: j.durationMs, errorCode: j.errorCode, reprintOf: j.reprintOf }))); } });
  return router;
}
