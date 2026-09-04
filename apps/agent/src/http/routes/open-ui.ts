import type { Database } from 'bun:sqlite';
import { Router } from '../router';
import { extractAuth, verifyAuth } from '../auth';
import { hashToken } from '../pairing';
import { PairingMetadataRepository } from '../../db/repositories/pairings';
import { UiLauncher } from '../../services/ui-launcher';

interface UiLauncherLike { launch(args?: string[]): void; }

export function createOpenUiRouter(db: Database, origins: string[], pairings: PairingMetadataRepository, launcher: UiLauncherLike = new UiLauncher()): Router {
  const router = new Router();
  router.add({ method: 'POST', path: '/v1/open-ui', handler: async req => { const ctx = extractAuth(req); const stored = ctx.token ? pairings.findByTokenHash(hashToken(ctx.token)) : null; const auth = verifyAuth(ctx, origins, stored?.tokenHash ?? null, stored?.origin ?? null); if (!auth.valid) return new Response(JSON.stringify({ code: auth.code ?? 'INVALID_TOKEN' }), { status: auth.code === 'FORBIDDEN_ORIGIN' ? 403 : 401, headers: { 'Content-Type': 'application/json' } }); try { const body = await req.json().catch(() => ({})) as { diagnostics?: unknown }; launcher.launch(body.diagnostics === true ? ['--diagnostics'] : []); return new Response(JSON.stringify({ opened: true }), { headers: { 'Content-Type': 'application/json' } }); } catch { return new Response(JSON.stringify({ code: 'GUI_NOT_INSTALLED' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); } } });
  return router;
}
