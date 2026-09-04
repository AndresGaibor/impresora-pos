import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync, unlinkSync, statSync, chmodSync, writeFileSync } from 'node:fs';
import { openDatabase, migrate, PairingMetadataRepository, PrinterProfileRepository, TemplateRepository } from '../src/db/database';
import { startServer } from '../src/http/server';
import { TemplateDefinitionSchema } from '@impresora-pos/templates';
import { provisionAdminCredential } from '../src/http/admin-auth';
import type { PrinterDevice, PrinterTransport } from '@impresora-pos/printer-core/src/types';
import { Database } from 'bun:sqlite';

const origin = 'http://localhost:3000';

function json(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { Origin: origin, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
}

describe('administrative API', () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  let credentialPath: string;
  let adminToken: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    const templates = new TemplateRepository(db);
    templates.save({ id: 'managed-1', name: 'Managed', type: 'receipt', content: JSON.stringify({ id: 'managed-1', name: 'Managed', source: 'managed', paperWidth: 80, blocks: [{ type: 'text', content: 'managed' }] }), source: 'managed', revision: 7 });
    templates.save({ id: 'builtin-test', name: 'Builtin', type: 'receipt', content: '{}', source: 'builtin' });
    new PrinterProfileRepository(db).save({ id: 'p1', name: 'Test', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    credentialPath = `/tmp/impresora-admin-${crypto.randomUUID()}`;
    const testTransport: PrinterTransport = { capabilities: { languages: ['esc-pos'], paperWidths: [58, 80] }, discover: async () => [], probe: async device => ({ device, reachable: true }), print: async (_device, bytes) => ({ success: true, bytesSent: bytes.length }) };
    const started = await startServer({ hostname: '127.0.0.1', port: 0, allowEphemeralPort: true, db, pairingRepo: new PairingMetadataRepository(db), approvedOrigins: [origin], adminCredentialPath: credentialPath, networkTransport: testTransport });
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
    adminToken = readFileSync(credentialPath, 'utf8').trim();
  });

  afterEach(() => {
    server?.stop();
    try { unlinkSync(credentialPath); } catch {}
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  test('rejects ERP pairing tokens', async () => {
    const response = await json(`${baseUrl}/admin/templates`, { headers: { Authorization: 'Bearer erp-token' } });
    expect(response.status).toBe(401);
  });

  test('dashboard aggregate uses the real health and capability contract', async () => {
    const response = await json(`${baseUrl}/admin/dashboard`, { headers: auth() });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
       status: 'degraded',
       agent: 'degraded',
      agentVersion: '1.0.0',
      profile: { name: 'Test', paperWidthMm: 80 },
    });
    expect(body.capabilities.supportedTransports).toEqual(['network']);
    expect(body.capabilities.supportedLanguages).toEqual(['esc-pos']);
    expect(body.capabilities.supportedPaperWidths).toEqual([80]);
  });

  test('dashboard auth errors use the standard error envelope', async () => {
    const response = await fetch(`${baseUrl}/admin/dashboard`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MISSING_ORIGIN', message: expect.any(String), requestId: expect.any(String) });
  });

  test('dashboard and public health are degraded without a usable profile', async () => {
    db.query('DELETE FROM printer_profiles').run();
    const publicHealth = await fetch(`${baseUrl}/v1/health`);
    expect((await publicHealth.json()).status).toBe('degraded');
    const dashboard = await json(`${baseUrl}/admin/dashboard`, { headers: auth() });
    expect(await dashboard.json()).toMatchObject({ status: 'degraded', agent: 'degraded', profile: null });
  });

  test('dashboard and public health are error when the persisted profile is invalid', async () => {
    db.query('UPDATE printer_profiles SET name = ?').run('');
    const publicHealth = await fetch(`${baseUrl}/v1/health`);
    expect((await publicHealth.json()).status).toBe('error');
    const dashboard = await json(`${baseUrl}/admin/dashboard`, { headers: auth() });
    expect(await dashboard.json()).toMatchObject({ status: 'error', agent: 'offline', profile: { name: '' } });
  });

  test('dashboard and public health are error when the selected transport is not ready', async () => {
    server.stop();
    const unavailableTransport: PrinterTransport = {
      ready: false,
      discover: async () => [],
      probe: async device => ({ device, reachable: false }),
      print: async () => ({ success: false, bytesSent: 0 }),
    };
    const started = await startServer({ hostname: '127.0.0.1', port: 0, allowEphemeralPort: true, db, pairingRepo: new PairingMetadataRepository(db), approvedOrigins: [origin], adminCredentialPath: credentialPath, networkTransport: unavailableTransport });
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
    const publicHealth = await fetch(`${baseUrl}/v1/health`);
    expect((await publicHealth.json()).status).toBe('error');
    const dashboard = await json(`${baseUrl}/admin/dashboard`, { headers: auth() });
    expect(await dashboard.json()).toMatchObject({ status: 'error', agent: 'offline' });
  });

  test('dashboard is degraded when transport readiness is unknown', async () => {
    server.stop();
    const unknownTransport: PrinterTransport = {
      discover: async () => [],
      probe: async device => ({ device, reachable: false }),
      print: async () => ({ success: false, bytesSent: 0 }),
    };
    const started = await startServer({ hostname: '127.0.0.1', port: 0, allowEphemeralPort: true, db, pairingRepo: new PairingMetadataRepository(db), approvedOrigins: [origin], adminCredentialPath: credentialPath, networkTransport: unknownTransport });
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
    const health = await fetch(`${baseUrl}/v1/health`);
    expect((await health.json()).status).toBe('degraded');
    const dashboard = await json(`${baseUrl}/admin/dashboard`, { headers: auth() });
    expect(await dashboard.json()).toMatchObject({ status: 'degraded', agent: 'degraded' });
  });

  test('admin preflight advertises administrative methods and headers', async () => {
    const response = await fetch(`${baseUrl}/admin/templates/x`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization, content-type' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  test('builtin templates are read-only', async () => {
    const response = await json(`${baseUrl}/admin/templates/builtin-test`, { method: 'DELETE', headers: auth() });
    expect(response.status).toBe(409);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect((await response.json()).code).toBe('TEMPLATE_READ_ONLY');
  });

  test('PUT builtin and managed cannot be bypassed by changing submitted source', async () => {
    const builtin = await json(`${baseUrl}/admin/templates/builtin-test`, { method: 'PUT', headers: auth(), body: JSON.stringify({ id: 'builtin-test', name: 'Changed', source: 'local', paperWidth: 80, blocks: [{ type: 'text', content: 'x' }] }) });
    expect(builtin.status).toBe(409);
    expect(builtin.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect((await builtin.json()).code).toBe('TEMPLATE_READ_ONLY');
    const managed = await json(`${baseUrl}/admin/templates/managed-1`, { method: 'PUT', headers: auth(), body: JSON.stringify({ id: 'managed-1', name: 'Changed', source: 'local', paperWidth: 80, blocks: [{ type: 'text', content: 'x' }] }) });
    expect(managed.status).toBe(409);
    expect(managed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect((await managed.json()).code).toBe('TEMPLATE_READ_ONLY');
  });

  test('managed duplication creates independent local template', async () => {
    const originalBytes = (db.query("SELECT content FROM templates WHERE id = 'managed-1'").get() as { content: string }).content;
    const original = await json(`${baseUrl}/admin/templates/managed-1`, { headers: auth() });
    const originalBody = await original.json();
    const response = await json(`${baseUrl}/admin/templates/managed-1/duplicate`, { method: 'POST', headers: auth() });
    expect(response.status).toBe(201);
    const duplicate = await response.json();
    expect(duplicate.source).toBe('local');
    expect(duplicate.id).not.toBe('managed-1');
    expect(duplicate.blocks).toEqual(originalBody.blocks);
    expect((await json(`${baseUrl}/admin/templates/managed-1`, { headers: auth() })).status).toBe(200);
    expect(await (await json(`${baseUrl}/admin/templates/managed-1`, { headers: auth() })).json()).toEqual(originalBody);
    expect((db.query("SELECT content FROM templates WHERE id = 'managed-1'").get() as { content: string }).content).toBe(originalBytes);
  });

  test('discovery is explicit and called once per request', async () => {
    let calls = 0;
    const transport: PrinterTransport = { discover: async () => { calls++; return [{ kind: 'system', deviceName: 'Fake' }]; }, probe: async (device: PrinterDevice) => ({ device, reachable: true }), print: async () => ({ success: true, bytesSent: 1 }) };
    server.stop();
    const started = await startServer({ hostname: '127.0.0.1', port: 0, allowEphemeralPort: true, db, pairingRepo: new PairingMetadataRepository(db), approvedOrigins: [origin], adminCredentialPath: credentialPath, systemTransport: transport });
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await json(`${baseUrl}/admin/printers/discover?transport=system`, { headers: auth() });
    expect(response.status).toBe(200);
    expect(calls).toBe(1);
  });

  test('test print goes through JobService as type test', async () => {
    const response = await json(`${baseUrl}/admin/test-print`, { method: 'POST', headers: auth(), body: JSON.stringify({ profileId: 'p1' }) });
    expect([202, 200]).toContain(response.status);
    const job = db.query("SELECT type FROM print_jobs WHERE type = 'test'").get() as { type?: string } | null;
    expect(job?.type).toBe('test');
  });

  test('admin JSON body routes enforce the 1MiB byte limit and error envelope', async () => {
    const oversized = JSON.stringify({ value: 'x'.repeat(1_100_000) });
    const requests = [
      json(`${baseUrl}/admin/profiles/p1`, { method: 'PUT', headers: auth(), body: oversized }),
      json(`${baseUrl}/admin/templates/import`, { method: 'POST', headers: auth(), body: oversized }),
      json(`${baseUrl}/admin/printers/probe`, { method: 'POST', headers: auth(), body: oversized }),
      json(`${baseUrl}/admin/test-print`, { method: 'POST', headers: auth(), body: oversized }),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ code: 'BODY_TOO_LARGE', message: expect.any(String), requestId: expect.any(String) });
    }
  });

  test('pairing-code generation binds the request Origin and requires admin auth', async () => {
    const unauthenticated = await json(`${baseUrl}/admin/pairing-codes?origin=${encodeURIComponent(origin)}`, { method: 'POST' });
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({ code: 'MISSING_TOKEN', message: expect.any(String), requestId: expect.any(String) });

    const response = await json(`${baseUrl}/admin/pairing-codes?origin=https%3A%2F%2Fevil.example`, { method: 'POST', headers: { ...auth(), Origin: origin } });
    expect(response.status).toBe(201);
    const code = await response.json() as { pairingCode: string };
    expect(code.pairingCode).toBeTruthy();
    const paired = await json(`${baseUrl}/v1/pair?origin=https%3A%2F%2Fevil.example`, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ pairingCode: code.pairingCode }) });
    expect(paired.status).toBe(200);
    expect((await paired.json()).token).toBeTruthy();
  });

  test('admin credential is hash-only, never returned, and remains owner-readable', async () => {
    const row = db.query('SELECT token_hash FROM admin_credentials').get() as { token_hash: string };
    expect(row.token_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(row.token_hash).not.toBe(adminToken);
    expect((await json(`${baseUrl}/admin/credential`, { headers: auth() })).status).toBe(404);
    expect(statSync(credentialPath).mode & 0o777).toBe(0o600);
    chmodSync(credentialPath, 0o644);
    provisionAdminCredential(db, credentialPath);
    expect(statSync(credentialPath).mode & 0o777).toBe(0o600);
  });

  test('rejects a credential file that does not match the stored hash', () => {
    const inconsistent = `${credentialPath}.inconsistent`;
    try {
      writeFileSync(inconsistent, 'not-the-admin-token\n', { mode: 0o600 });
      expect(() => provisionAdminCredential(db, inconsistent)).toThrow('ADMIN_CREDENTIAL_INCONSISTENT');
      expect(() => provisionAdminCredential(db, inconsistent)).toThrow(/ADMIN_CREDENTIAL_INCONSISTENT/);
    } finally {
      try { unlinkSync(inconsistent); } catch {}
    }
  });

  test('repeated provisioning keeps one stable credential and does not replace its file', () => {
    const isolatedDb = openDatabase(':memory:');
    migrate(isolatedDb);
    const path = `/tmp/impresora-admin-repeat-${crypto.randomUUID()}`;
    try {
      const first = provisionAdminCredential(isolatedDb, path);
      const contents = readFileSync(path, 'utf8').trim();
      expect(first).toBe(contents);
      expect(provisionAdminCredential(isolatedDb, path)).toBeNull();
      expect(readFileSync(path, 'utf8').trim()).toBe(contents);
      expect((isolatedDb.query('SELECT COUNT(*) AS count FROM admin_credentials').get() as { count: number }).count).toBe(1);
    } finally {
      isolatedDb.close();
      try { unlinkSync(path); } catch {}
    }
  });

  test('separate Bun processes provision one shared credential concurrently', async () => {
    const dbPath = `/tmp/impresora-admin-db-${crypto.randomUUID()}.sqlite`;
    const path = `/tmp/impresora-admin-concurrent-${crypto.randomUUID()}`;
    const setupDb = new Database(dbPath);
    try {
      migrate(setupDb);
      setupDb.close();
      const modulePath = `${process.cwd()}/apps/agent/src/http/admin-auth.ts`;
      const script = `import { Database } from 'bun:sqlite'; import { provisionAdminCredential } from ${JSON.stringify(`file://${modulePath}`)}; const db = new Database(${JSON.stringify(dbPath)}); try { provisionAdminCredential(db, ${JSON.stringify(path)}); db.close(); process.exit(0); } catch { db.close(); process.exit(1); }`;
      const processes = [Bun.spawn([process.execPath, '-e', script], { stdout: 'ignore', stderr: 'ignore' }), Bun.spawn([process.execPath, '-e', script], { stdout: 'ignore', stderr: 'ignore' })];
      const statuses = await Promise.all(processes.map(process => process.exited));
      expect(statuses).toEqual([0, 0]);
      const checkDb = new Database(dbPath);
      expect(readFileSync(path, 'utf8').trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((checkDb.query('SELECT COUNT(*) AS count FROM admin_credentials').get() as { count: number }).count).toBe(1);
      expect((checkDb.query('SELECT token_hash FROM admin_credentials').get() as { token_hash: string }).token_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      checkDb.close();
    } finally {
      try { setupDb.close(); } catch {}
      try { unlinkSync(path); } catch {}
      try { unlinkSync(dbPath); } catch {}
      try { unlinkSync(`${dbPath}-wal`); } catch {}
      try { unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  test('import/export validates schema, guardrails and preserves revision', async () => {
    const imported = { id: 'invoice-local', name: 'Invoice local', source: 'local', paperWidth: 80, revision: 9, blocks: [] };
    const invalid = await json(`${baseUrl}/admin/templates/import`, { method: 'POST', headers: auth(), body: JSON.stringify({ ...imported, source: 'builtin' }) });
    expect(invalid.status).toBe(422);
    const rejected = await json(`${baseUrl}/admin/templates/import`, { method: 'POST', headers: auth(), body: JSON.stringify(imported) });
    expect(rejected.status).toBe(422);
    const valid = { ...imported, name: 'Receipt local', blocks: [{ type: 'text', content: 'ok' }] };
    const saved = await json(`${baseUrl}/admin/templates/import`, { method: 'POST', headers: auth(), body: JSON.stringify(valid) });
    expect(saved.status).toBe(201);
    expect((await saved.json()).revision).toBe(9);
    const exported = await json(`${baseUrl}/admin/templates/invoice-local/export`, { headers: auth() });
    expect(exported.status).toBe(200);
    expect(TemplateDefinitionSchema.parse(await exported.json()).id).toBe('invoice-local');
  });

  test('profile schema rejects invalid data without probing and diagnostics are bounded', async () => {
    const invalid = await json(`${baseUrl}/admin/profiles/p1`, { method: 'PUT', headers: auth(), body: JSON.stringify({ id: 'p1', name: '', transport: 'network', device: { kind: 'network', host: 'bad', port: 0 }, language: 'esc-pos', paperWidthMm: 80, columns: 48, codepageMapping: 'standard' }) });
    expect(invalid.status).toBe(422);
    for (let i = 0; i < 105; i++) db.query("INSERT INTO print_jobs (job_id, type, profile_id) VALUES (?, 'invoice', 'p1')").run(`recent-${i}`);
    const recent = await json(`${baseUrl}/admin/diagnostics/recent?limit=999`, { headers: auth() });
    expect(recent.status).toBe(200);
    const rows = await recent.json() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(100);
    expect(rows[0]).not.toHaveProperty('payload');
    expect(rows[0]).not.toHaveProperty('customer');
  });
});
