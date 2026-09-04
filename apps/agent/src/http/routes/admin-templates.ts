import { Router } from '../router';
import { readAdminJson, verifyAdminRequest } from '../admin-auth';
import { TemplateReadOnlyError, TemplateService } from '../../services/template-service';
import { TemplateRepository } from '../../db/repositories/templates';
import type { Database } from 'bun:sqlite';

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
  const value = body as Record<string, unknown>;
  const normalized = typeof value?.code === 'string'
    ? { ...value, message: value.message ?? value.code, requestId: value.requestId ?? crypto.randomUUID() }
    : body;
  return new Response(JSON.stringify(normalized), { status, headers: { 'Content-Type': 'application/json', ...headers } });
};
export function createAdminTemplatesRouter(db: Database, origins: string[]): Router {
  const router = new Router(); const service = new TemplateService(new TemplateRepository(db)); const auth = (req: Request) => verifyAdminRequest(req, db, origins);
  router.add({ method: 'GET', path: '/admin/templates', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); return reply(service.list()); } });
  router.add({ method: 'GET', path: '/admin/templates/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); const t = service.get(params['id']!); return t ? reply(t) : reply({ code: 'NOT_FOUND' }, 404); } });
  router.add({ method: 'GET', path: '/admin/templates/:id/export', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); const t = service.get(params['id']!); return t ? reply(t, 200, { 'Content-Disposition': `attachment; filename="${t.id}.json"` }) : reply({ code: 'NOT_FOUND' }, 404); } });
   router.add({ method: 'POST', path: '/admin/templates/import', handler: async req => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const body = await readAdminJson(req); if (!body.ok) return reply({ code: body.code, message: body.message, requestId: crypto.randomUUID() }, body.status); try { const input = body.value as { template?: unknown }; return reply(service.save(input.template ?? input), 201); } catch (e) { return reply({ code: 'VALIDATION_ERROR', message: e instanceof Error ? e.message : 'Invalid template', requestId: crypto.randomUUID() }, 422); } } });
   router.add({ method: 'PUT', path: '/admin/templates/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code, requestId: crypto.randomUUID() }, a.status); const body = await readAdminJson(req); if (!body.ok) return reply({ code: body.code, message: body.message, requestId: crypto.randomUUID() }, body.status); try { return reply(service.save({ ...(body.value as object), id: params['id'] })); } catch (e) { return reply({ code: e instanceof TemplateReadOnlyError ? 'TEMPLATE_READ_ONLY' : 'VALIDATION_ERROR', requestId: crypto.randomUUID() }, e instanceof TemplateReadOnlyError ? 409 : 422); } } });
  router.add({ method: 'POST', path: '/admin/templates/:id/duplicate', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); try { return reply(service.duplicate(params['id']!), 201); } catch { return reply({ code: 'NOT_FOUND' }, 404); } } });
  router.add({ method: 'DELETE', path: '/admin/templates/:id', handler: async (req, params) => { const a = auth(req); if (!a.ok) return reply({ code: a.code }, a.status); try { service.delete(params['id']!); return reply({ ok: true }); } catch (e) { return reply({ code: e instanceof TemplateReadOnlyError ? 'TEMPLATE_READ_ONLY' : 'NOT_FOUND' }, e instanceof TemplateReadOnlyError ? 409 : 404); } } });
  return router;
}
