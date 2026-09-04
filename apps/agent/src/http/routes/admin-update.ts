import type { Database } from 'bun:sqlite';
import { Router } from '../router';
import { verifyAdminRequest } from '../admin-auth';
import { canApplyUpdate } from '../../update/verify';
import type { UpdateState } from '../../update/state';
import { applyVerifiedInstaller } from '../../update/installer';

export function createAdminUpdateRouter(db: Database, origins: string[], state: UpdateState): Router {
  const router = new Router();
  const auth = (req: Request) => verifyAdminRequest(req, db, origins);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  router.add({ method: 'GET', path: '/admin/update', handler: async req => { const result = auth(req); if (!result.ok) return reply({ code: result.code }, result.status); return reply(state); } });
  router.add({ method: 'POST', path: '/admin/update/check', handler: async req => { const result = auth(req); if (!result.ok) return reply({ code: result.code }, result.status); state.lastCheckAt = Date.now(); return reply({ checked: true, state }); } });
  router.add({ method: 'POST', path: '/admin/update/apply', handler: async req => { const result = auth(req); if (!result.ok) return reply({ code: result.code }, result.status); if (!state.verified || !state.stagedPath || !state.stagedSha256) return reply({ code: 'UPDATE_NOT_VERIFIED' }, 409); const active = db.query("SELECT state FROM print_jobs WHERE state IN ('QUEUED', 'SENDING')").all() as Array<{ state: string }>; if (!canApplyUpdate(active.map(item => item.state))) return reply({ code: 'UPDATE_DEFERRED_BUSY' }, 409); try { await applyVerifiedInstaller(state.stagedPath, state.stagedSha256); return reply({ applied: true }); } catch (error) { return reply({ code: error instanceof Error ? error.message : 'UPDATE_APPLY_FAILED' }, 422); } } });
  return router;
}
