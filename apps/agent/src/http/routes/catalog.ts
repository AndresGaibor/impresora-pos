import { Router } from '../router';
import type { Database } from 'bun:sqlite';

export function createCatalogRouter(
  db: Database,
): Router {
  const router = new Router();

  router.add({
    method: 'GET',
    path: '/v1/templates',
    auth: false,
    handler: async () => {
      const rows = db.query('SELECT id, name, type FROM templates').all() as Array<Record<string, unknown>>;
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  router.add({
    method: 'GET',
     path: '/v1/printer-profiles',
    auth: false,
    handler: async () => {
      const rows = db.query('SELECT id, name, paper_width_mm FROM printer_profiles').all() as Array<Record<string, unknown>>;
      const profiles = rows.map(row => ({
        id: row['id'],
        name: row['name'],
        paperWidthMm: row['paper_width_mm'],
      }));
      return new Response(JSON.stringify(profiles), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  return router;
}
