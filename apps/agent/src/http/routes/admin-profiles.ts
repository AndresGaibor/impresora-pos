import { Router } from '../router';
import { readAdminJson, verifyAdminRequest } from '../admin-auth';
import { ProfileService } from '../../services/profile-service';
import { PrinterProfileRepository } from '../../db/repositories/profiles';
import type { Database } from 'bun:sqlite';

const reply = (body: unknown, status = 200) => {
  const value = body as Record<string, unknown>;
  const normalized = typeof value?.code === 'string'
    ? { ...value, message: value.message ?? value.code, requestId: value.requestId ?? crypto.randomUUID() }
    : body;
  return new Response(JSON.stringify(normalized), { status, headers: { 'Content-Type': 'application/json' } });
};
export function createAdminProfilesRouter(db: Database, origins: string[]): Router {
  const router = new Router(); const service = new ProfileService(new PrinterProfileRepository(db));
  const auth = (req: Request) => verifyAdminRequest(req, db, origins);
  router.add({ method: 'GET', path: '/admin/profiles', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); return reply(service.list()); } });
  router.add({ method: 'GET', path: '/admin/profiles/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); const p = service.get(params['id']!); return p ? reply(p) : reply({ code: 'NOT_FOUND' }, 404); } });
   router.add({ method: 'PUT', path: '/admin/profiles/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const body = await readAdminJson(req); if (!body.ok) return reply({ code: body.code, message: body.message, requestId: crypto.randomUUID() }, body.status); try { const p = body.value; return reply(service.save({ ...(p as object), id: params['id'] }), 200); } catch (e) { return reply({ code: 'VALIDATION_ERROR', message: e instanceof Error ? e.message : 'Invalid profile', requestId: crypto.randomUUID() }, 422); } } });
  router.add({ method: 'DELETE', path: '/admin/profiles/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); service.delete(params['id']!); return reply({ ok: true }); } });
  return router;
}
