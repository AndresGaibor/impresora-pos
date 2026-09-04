import type { Database } from 'bun:sqlite';
import { TemplateDefinitionSchema, validateFiscalTemplate, type TemplateDefinition } from '@impresora-pos/templates';
import { TemplateRepository } from '../../db/repositories/templates';
import { extractAuth, verifyAuth } from '../auth';
import { hashToken } from '../pairing';
import { PairingMetadataRepository } from '../../db/repositories/pairings';
import { Router } from '../router';

export function createManagedTemplatesRouter(db: Database, origins: string[], pairingRepo: PairingMetadataRepository): Router {
  const router = new Router(); const repo = new TemplateRepository(db);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const owner = (req: Request) => { const ctx = extractAuth(req); const stored = ctx.token ? pairingRepo.findByTokenHash(hashToken(ctx.token)) : null; const auth = verifyAuth(ctx, origins, stored?.tokenHash ?? null, stored?.origin ?? null); return auth.valid ? ctx.origin : null; };
  router.add({ method: 'PUT', path: '/v1/managed-templates', handler: async req => { const origin = owner(req); if (!origin) return reply({ code: 'FORBIDDEN_TEMPLATE_OWNER' }, 403); let input: unknown; try { input = await req.json(); } catch { return reply({ code: 'INVALID_JSON' }, 400); } const parsed = TemplateDefinitionSchema.safeParse(input); if (!parsed.success) return reply({ code: 'VALIDATION_ERROR' }, 422); const template = parsed.data as TemplateDefinition; if (template.name.toLowerCase().includes('invoice') && !validateFiscalTemplate(template, 'invoice').valid) return reply({ code: 'FISCAL_GUARDRAIL_FAILED' }, 422); const old = repo.find(template.id); if (old?.source === 'managed' && old.ownerOrigin !== origin) return reply({ code: 'FORBIDDEN_TEMPLATE_OWNER' }, 403); const saved = { ...template, source: 'managed' as const, revision: (old?.revision ?? 0) + 1 }; repo.save({ id: saved.id, name: saved.name, type: 'receipt', content: JSON.stringify(saved), source: 'managed', revision: saved.revision, ownerOrigin: origin }); return reply(saved); } });
  router.add({ method: 'DELETE', path: '/v1/managed-templates/:id', handler: async (req, params) => { const origin = owner(req); if (!origin) return reply({ code: 'FORBIDDEN_TEMPLATE_OWNER' }, 403); const current = repo.find(params.id!); if (!current || current.source !== 'managed') return reply({ code: 'NOT_FOUND' }, 404); if (current.ownerOrigin !== origin) return reply({ code: 'FORBIDDEN_TEMPLATE_OWNER' }, 403); repo.delete(current.id); return reply({ ok: true }); } });
  return router;
}
