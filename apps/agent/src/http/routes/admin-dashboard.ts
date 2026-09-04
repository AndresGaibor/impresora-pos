import type { Database } from 'bun:sqlite';
import { Router } from '../router';
import { verifyAdminRequest } from '../admin-auth';
import { PrinterProfileRepository } from '../../db/repositories/profiles';
import { JobMetadataRepository } from '../../db/repositories/jobs';
import { capabilitiesSnapshot, healthSnapshot, type HealthComposition } from './health';

export function createAdminDashboardRouter(db: Database, origins: string[], composition: HealthComposition): Router {
  const router = new Router();
  const profiles = new PrinterProfileRepository(db);
  const jobs = new JobMetadataRepository(db);
  router.add({
    method: 'GET',
    path: '/admin/dashboard',
    handler: async req => {
      const auth = verifyAdminRequest(req, db, origins);
      if (!auth.ok) return reply({ code: auth.code, message: authMessage(auth.code), requestId: crypto.randomUUID() }, auth.status);
      const profile = profiles.all()[0];
      const recentJobs = jobs.recent(20).map(job => ({ jobId: job.jobId, state: job.state }));
      const latest = jobs.recent(1)[0];
      const health = healthSnapshot(composition);
      const capabilities = capabilitiesSnapshot(composition);
      return new Response(JSON.stringify({
        status: health.status, agent: health.status === 'error' ? 'offline' : health.status === 'degraded' ? 'degraded' : 'online',
        agentVersion: health.agentVersion, apiVersion: health.apiVersion, templateSchemaVersion: health.templateSchemaVersion,
        profile: profile ? { name: profile.name, paperWidthMm: profile.paperWidthMm } : null,
        lastJob: latest ? { state: latest.state, at: new Date(latest.updatedAt * 1000).toISOString() } : null,
        recentJobs,
        capabilities,
      }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  return router;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function authMessage(code: string): string {
  if (code === 'MISSING_ORIGIN') return 'Origin is required';
  if (code === 'FORBIDDEN_ORIGIN') return 'Origin not allowed';
  if (code === 'MISSING_TOKEN') return 'Authorization required';
  return 'Authentication failed';
}
