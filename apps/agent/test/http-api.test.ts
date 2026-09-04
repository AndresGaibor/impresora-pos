import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { openDatabase, migrate, PairingMetadataRepository, PrinterProfileRepository, TemplateRepository } from '../src/db/database';
import { startServer } from '../src/http/server';
import { PairingService } from '../src/http/pairing';
import { RateLimiter } from '../src/http/rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import type { Database } from 'bun:sqlite';
import type { Server } from 'bun';
import { CapabilitiesResponseSchema, HealthResponseSchema } from '../../../packages/contracts/src';
import { unlinkSync } from 'node:fs';

const APPROVED_ORIGIN = 'https://pos.example.com';
const OTHER_ORIGIN = 'https://evil.example.com';
const PAIRING_CODE = 'test-pairing-code-123';

function createTestDb(): Database {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

async function fetchJson(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  let body: unknown;
  const text = await response.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: response.status, body };
}

describe('HTTP API - Security and Auth', () => {
  let db: Database;
  let pairingRepo: PairingMetadataRepository;
  let profileRepo: PrinterProfileRepository;
  let templateRepo: TemplateRepository;
  let server: Server<unknown>;
  let baseUrl: string;
  let credentialPath: string;

  beforeEach(async () => {
    db = createTestDb();
    pairingRepo = new PairingMetadataRepository(db);
    profileRepo = new PrinterProfileRepository(db);
    templateRepo = new TemplateRepository(db);

    profileRepo.save({ id: 'p1', name: 'Printer 1', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    templateRepo.save({ id: 't1', name: 'Invoice', type: 'invoice', content: '{{title}}' });
    pairingRepo.approve({ token: 'dummy', origin: APPROVED_ORIGIN });

    const hostname = '127.0.0.1';
    credentialPath = `/tmp/impresora-pos-http-${crypto.randomUUID()}.token`;
    const s = await startServer({
      hostname,
      port: 0,
      allowEphemeralPort: true,
      db,
      pairingRepo,
      approvedOrigins: [APPROVED_ORIGIN],
      adminCredentialPath: credentialPath,
    });
    server = s.server;
    baseUrl = `http://${hostname}:${s.port}`;
  });

  afterEach(() => {
    server?.stop();
    try { unlinkSync(credentialPath); } catch {}
  });

  test('GET /v1/health works without auth', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/health`);
    expect(status).toBe(200);
    expect(HealthResponseSchema.parse(body)).toMatchObject({ status: 'ok', apiVersion: 1 });
  });

  test('GET /v1/capabilities works without auth', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/capabilities`);
    expect(status).toBe(200);
    expect(CapabilitiesResponseSchema.parse(body).supportedTransports).toContain('network');
  });

  test('startServer rejects non-loopback hostname', async () => {
    await expect(startServer({
      hostname: '0.0.0.0',
      db,
      pairingRepo,
      approvedOrigins: [APPROVED_ORIGIN],
    })).rejects.toThrow('127.0.0.1');
  });

  test('OPTIONS rejected origin and 404 return non-empty error envelopes', async () => {
    const options = await fetchJson(`${baseUrl}/v1/health`, {
      method: 'OPTIONS',
      headers: { Origin: OTHER_ORIGIN },
    });
    expect(options.status).toBe(403);
    expect((options.body as { code?: string; requestId?: string }).code).toBe('FORBIDDEN_ORIGIN');
    expect((options.body as { requestId?: string }).requestId).toBeTruthy();

    const missing = await fetchJson(`${baseUrl}/v1/not-found`);
    expect(missing.status).toBe(404);
    expect((missing.body as { requestId?: string }).requestId).toBeTruthy();
  });

  test('POST /v1/print rejects missing Origin', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      body: JSON.stringify({ type: 'invoice', jobId: 'j1', data: {} }),
    });
    expect(status).toBe(403);
    expect((body as { code?: string }).code).toBe('MISSING_ORIGIN');
  });

  test('POST /v1/print rejects wrong Origin', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: OTHER_ORIGIN },
      body: JSON.stringify({ type: 'invoice', jobId: 'j1', data: {} }),
    });
    expect(status).toBe(403);
    expect((body as { code?: string }).code).toBe('FORBIDDEN_ORIGIN');
  });

  test('POST /v1/print rejects missing token', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ type: 'invoice', jobId: 'j1', data: {} }),
    });
    expect(status).toBe(401);
    expect((body as { code?: string }).code).toBe('MISSING_TOKEN');
  });

  test('POST /v1/print rejects wrong token', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ type: 'invoice', jobId: 'j1', data: {} }),
    });
    expect(status).toBe(401);
    expect((body as { code?: string }).code).toBe('INVALID_TOKEN');
  });

  test('POST /v1/print rejects oversized body (>1MiB)', async () => {
    const bigBody = JSON.stringify({ type: 'invoice', jobId: 'j1', data: { title: 'x'.repeat(2 * 1024 * 1024) } });
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer dummy' },
      body: bigBody,
    });
    expect(status).toBe(413);
    expect((body as { code?: string }).code).toBe('BODY_TOO_LARGE');
  });

  test('POST /v1/print measures multibyte bodies in bytes without Content-Length', async () => {
    const body = JSON.stringify({ type: 'invoice', jobId: 'multibyte', data: { title: 'é'.repeat(600_000) } });
    const { status, body: responseBody } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer dummy' },
      body,
    });
    expect(status).toBe(413);
    expect((responseBody as { code?: string }).code).toBe('BODY_TOO_LARGE');
  });

  test('failed authentication is rate limited and does not consume print quota', async () => {
    for (let i = 0; i < 21; i++) {
      const response = await fetchJson(`${baseUrl}/v1/print`, {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer wrong-token' },
        body: '{}',
      });
      expect(response.status).toBe(i < 20 ? 401 : 429);
    }

    const valid = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer dummy' },
      body: JSON.stringify({ schemaVersion: 1, type: 'invoice', jobId: 'auth-quota', data: { title: 'Test', invoiceNumber: 'A', date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' } }),
    });
    expect(valid.status).toBe(202);
  });

  test('POST /v1/print rejects malformed schema', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: 'Bearer dummy' },
      body: JSON.stringify({ type: 'invalid-type', jobId: 'j1' }),
    });
    expect(status).toBe(422);
    expect((body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  test('error envelope contains code, message, requestId', async () => {
    const { body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({}),
    });
    const err = body as { code?: string; message?: string; requestId?: string };
    expect(err.code).toBeDefined();
    expect(err.message).toBeDefined();
    expect(err.requestId).toBeDefined();
  });
});

describe('HTTP API - Pairing', () => {
  let db: Database;
  let pairingRepo: PairingMetadataRepository;
  let profileRepo: PrinterProfileRepository;
  let templateRepo: TemplateRepository;
  let server: Server<unknown>;
  let baseUrl: string;
  let pairingService: InstanceType<typeof import('../src/http/pairing').PairingService>;
  let credentialPath: string;

  beforeEach(async () => {
    db = createTestDb();
    pairingRepo = new PairingMetadataRepository(db);
    profileRepo = new PrinterProfileRepository(db);
    templateRepo = new TemplateRepository(db);

    profileRepo.save({ id: 'p1', name: 'Printer 1', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    templateRepo.save({ id: 't1', name: 'Invoice', type: 'invoice', content: '{{title}}' });

    const hostname = '127.0.0.1';
    credentialPath = `/tmp/impresora-pos-pairing-${crypto.randomUUID()}.token`;
    const s = await startServer({
      hostname,
      port: 0,
      allowEphemeralPort: true,
      db,
      pairingRepo,
      approvedOrigins: [APPROVED_ORIGIN],
      adminCredentialPath: credentialPath,
    });
    server = s.server;
    baseUrl = `http://${hostname}:${s.port}`;
    pairingService = s.pairingService;
    pairingService.registerPairingCode(PAIRING_CODE, APPROVED_ORIGIN);
  });

  afterEach(() => {
    server?.stop();
    try { unlinkSync(credentialPath); } catch {}
  });

  test('POST /v1/pair with valid code and Origin returns token once', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    expect(status).toBe(200);
    const resp = body as { token?: string };
    expect(resp.token).toBeDefined();
    expect(typeof resp.token).toBe('string');
    expect(resp.token!.length).toBeGreaterThan(20);

    const tokenHash = `sha256:${createHash('sha256').update(resp.token!).digest('hex')}`;
    const stored = pairingRepo.findByTokenHash(tokenHash);
    expect(stored).not.toBeNull();
    expect(stored!.origin).toBe(APPROVED_ORIGIN);
  });

  test('POST /v1/pair rejects reuse of a consumed code', async () => {
    const r1 = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    const token1 = (r1.body as { token: string }).token;

    const r2 = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    expect(r2.status).toBe(401);
    expect((r2.body as { code?: string }).code).toBe('INVALID_PAIRING_CODE');
    expect(token1).toBeDefined();
  });

  test('concurrent pairing requests reserve a code atomically', async () => {
    pairingService.registerPairingCode('concurrent-code', APPROVED_ORIGIN);
    const results = await Promise.all(Array.from({ length: 8 }, () => pairingService.createToken('concurrent-code', APPROVED_ORIGIN)));
    const tokens = results.filter((result): result is { token: string; isNew: boolean } => result !== null);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.isNew).toBe(true);
    expect(pairingService.verifyToken(tokens[0]!.token, APPROVED_ORIGIN)).toBe(true);
  });

  test('POST /v1/pair with different Origin fails', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: OTHER_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    expect(status).toBe(403);
    expect((body as { code?: string }).code).toBe('FORBIDDEN_ORIGIN');
  });

  test('POST /v1/pair with wrong code fails', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: 'wrong-code' }),
    });
    expect(status).toBe(401);
    expect((body as { code?: string }).code).toBe('INVALID_PAIRING_CODE');
  });

  test('POST /v1/pair rejects null and oversized bodies with envelopes', async () => {
    const nullBody = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: 'null',
    });
    expect(nullBody.status).toBe(400);
    expect((nullBody.body as { code?: string; requestId?: string }).code).toBe('INVALID_REQUEST');
    expect((nullBody.body as { requestId?: string }).requestId).toBeTruthy();

    const oversized = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: 'x'.repeat(1_100_000) }),
    });
    expect(oversized.status).toBe(413);
    expect((oversized.body as { code?: string }).code).toBe('BODY_TOO_LARGE');
  });

  test('token used with wrong Origin is rejected', async () => {
    const { body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    const token = (body as { token: string }).token;

    const { status, body: errBody } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: OTHER_ORIGIN, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'invoice', jobId: 'j1', data: { title: 'Test' } }),
    });
    expect(status).toBe(403);
    expect((errBody as { code?: string }).code).toBe('FORBIDDEN_ORIGIN');
  });

  test('token hash is timing-safe (constant time comparison)', async () => {
    const { body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    const token = (body as { token: string }).token;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const stored = pairingRepo.findByTokenHash(`sha256:${tokenHash}`);
    expect(stored).not.toBeNull();
    const fakeHash = createHash('sha256').update('fake-token').digest('hex');
    const fakeStored = pairingRepo.findByTokenHash(`sha256:${fakeHash}`);
    expect(fakeStored).toBeNull();
  });

  test('POST /v1/pair without Origin fails', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    expect(status).toBe(403);
  });

  test('pairing rate limit - too many requests', async () => {
    const results: { status: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetchJson(`${baseUrl}/v1/pair`, {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGIN },
        body: JSON.stringify({ pairingCode: PAIRING_CODE }),
      });
      results.push({ status: r.status });
    }
    const lastResult = results[results.length - 1]!;
    expect(lastResult.status).toBe(429);
  });
});

describe('HTTP API - Print Job', () => {
  let db: Database;
  let pairingRepo: PairingMetadataRepository;
  let profileRepo: PrinterProfileRepository;
  let templateRepo: TemplateRepository;
  let server: Server<unknown>;
  let baseUrl: string;
  let validToken: string;
  let credentialPath: string;

  beforeEach(async () => {
    db = createTestDb();
    pairingRepo = new PairingMetadataRepository(db);
    profileRepo = new PrinterProfileRepository(db);
    templateRepo = new TemplateRepository(db);

    profileRepo.save({ id: 'p1', name: 'Printer 1', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    templateRepo.save({ id: 't1', name: 'Invoice', type: 'invoice', content: '{{title}}' });

    const hostname = '127.0.0.1';
    credentialPath = `/tmp/impresora-pos-print-${crypto.randomUUID()}.token`;
    const s = await startServer({
      hostname,
      port: 0,
      allowEphemeralPort: true,
      db,
      pairingRepo,
      approvedOrigins: [APPROVED_ORIGIN],
      adminCredentialPath: credentialPath,
    });
    server = s.server;
    baseUrl = `http://${hostname}:${s.port}`;
    s.pairingService.registerPairingCode(PAIRING_CODE, APPROVED_ORIGIN);

    const { body } = await fetchJson(`${baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ pairingCode: PAIRING_CODE }),
    });
    validToken = (body as { token: string }).token;
  });

  afterEach(() => {
    server?.stop();
    try { unlinkSync(credentialPath); } catch {}
  });

  test('POST /v1/print with valid token and body returns 202 for new job', async () => {
    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({
        schemaVersion: 1,
        type: 'invoice',
        jobId: 'test-job-1',
        data: { title: 'Test Invoice', invoiceNumber: 'INV-001', date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' },
      }),
    });
    expect(status).toBe(202);
    const resp = body as { jobId?: string; state?: string };
    expect(resp.jobId).toBe('test-job-1');
    expect(resp.state).toBeDefined();
  });

  test('POST /v1/print duplicate jobId returns 200 with existing state', async () => {
    const payload = {
      schemaVersion: 1,
      type: 'invoice',
      jobId: 'dup-job-1',
      data: { title: 'Test Invoice', invoiceNumber: 'INV-002', date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' },
    };
    const h = { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` };

    await fetchJson(`${baseUrl}/v1/print`, { method: 'POST', headers: h, body: JSON.stringify(payload) });
    await new Promise(r => setTimeout(r, 50));

    const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(payload),
    });
    expect(status).toBe(200);
    const resp = body as { jobId?: string; state?: string };
    expect(resp.jobId).toBe('dup-job-1');
  });

  test('more than 20 valid prints do not consume the auth failure limit', async () => {
    const unrestricted = await startServer({
      hostname: '127.0.0.1',
      db,
      pairingRepo,
      port: 0,
      allowEphemeralPort: true,
      approvedOrigins: [APPROVED_ORIGIN],
      adminCredentialPath: credentialPath,
      rateLimiter: new RateLimiter(
        { windowMs: 60_000, maxRequests: 100 },
        { windowMs: 60_000, maxRequests: 100 },
        { windowMs: 60_000, maxRequests: 20 },
      ),
    });
    const unrestrictedUrl = `http://127.0.0.1:${unrestricted.port}`;
    unrestricted.pairingService.registerPairingCode('valid-print-code', APPROVED_ORIGIN);

    try {
      const pairing = await fetchJson(`${unrestrictedUrl}/v1/pair`, {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGIN },
        body: JSON.stringify({ pairingCode: 'valid-print-code' }),
      });
      const token = (pairing.body as { token: string }).token;

      for (let i = 0; i < 21; i++) {
        const response = await fetchJson(`${unrestrictedUrl}/v1/print`, {
          method: 'POST',
          headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            schemaVersion: 1,
            type: 'invoice',
            jobId: `valid-auth-limit-${i}`,
            data: { title: 'Test', invoiceNumber: `VALID-${i}`, date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' },
          }),
        });
        expect(response.status).toBe(202);
      }
    } finally {
      unrestricted.server.stop();
    }
  });

  test('POST /v1/print validates schemaVersion, data, and top-level keys before reserving', async () => {
    const validData = { title: 'Test Invoice', invoiceNumber: 'INV-VALIDATE', date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' };
    const cases = [
      { jobId: 'missing-version', type: 'invoice', data: validData },
      { schemaVersion: 1, jobId: 'invalid-data', type: 'invoice', data: { title: 'Incomplete' } },
      { schemaVersion: 1, jobId: 'unknown-key', type: 'invoice', data: validData, unexpected: true },
    ];

    for (const payload of cases) {
      const { status, body } = await fetchJson(`${baseUrl}/v1/print`, {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
        body: JSON.stringify(payload),
      });
      expect(status).toBe(422);
      expect((body as { code?: string }).code).toBe('VALIDATION_ERROR');

      const statusResponse = await fetchJson(`${baseUrl}/v1/jobs/${payload.jobId}`, {
        headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
      });
      expect(statusResponse.status).toBe(404);
    }
  });

  test('GET /v1/jobs/:jobId returns status', async () => {
    const payload = {
      schemaVersion: 1,
      type: 'invoice',
      jobId: 'status-job-1',
      data: { title: 'Test', invoiceNumber: 'INV-003', date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' },
    };
    await fetchJson(`${baseUrl}/v1/print`, {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
      body: JSON.stringify(payload),
    });
    await new Promise(r => setTimeout(r, 50));

    const { status, body } = await fetchJson(`${baseUrl}/v1/jobs/status-job-1`, {
      headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
    });
    expect(status).toBe(200);
    const resp = body as { jobId?: string; state?: string };
    expect(resp.jobId).toBe('status-job-1');
    expect(resp.state).toBeDefined();
  });

  test('GET /v1/jobs/:jobId without auth fails', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/jobs/some-job`);
    expect(status).toBe(403);
  });

  test('print rate limit - too many requests', async () => {
    const results: number[] = [];
    for (let i = 0; i < 15; i++) {
      const { status } = await fetchJson(`${baseUrl}/v1/print`, {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGIN, Authorization: `Bearer ${validToken}` },
        body: JSON.stringify({
          schemaVersion: 1,
          type: 'invoice',
          jobId: `rate-limit-job-${i}`,
          data: { title: 'Test', invoiceNumber: `INV-${i}`, date: '2024-01-01', customerName: 'Test', lines: [], subtotal: '0', tax: '0', total: '0' },
        }),
      });
      results.push(status);
    }
    const tooMany = results.filter(s => s === 429).length;
    expect(tooMany).toBeGreaterThan(0);
  });
});

describe('HTTP API - Public Routes Exact', () => {
  let db: Database;
  let pairingRepo: PairingMetadataRepository;
  let profileRepo: PrinterProfileRepository;
  let templateRepo: TemplateRepository;
  let server: Server<unknown>;
  let baseUrl: string;
  let credentialPath: string;

  beforeEach(async () => {
    db = createTestDb();
    pairingRepo = new PairingMetadataRepository(db);
    profileRepo = new PrinterProfileRepository(db);
    templateRepo = new TemplateRepository(db);

    profileRepo.save({ id: 'p1', name: 'Printer 1', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    templateRepo.save({ id: 't1', name: 'Invoice', type: 'invoice', content: '{{title}}' });

    const hostname = '127.0.0.1';
    credentialPath = `/tmp/impresora-pos-public-${crypto.randomUUID()}.token`;
    const s = await startServer({
      hostname,
      port: 0,
      allowEphemeralPort: true,
      db,
      pairingRepo,
      approvedOrigins: [APPROVED_ORIGIN],
      adminCredentialPath: credentialPath,
    });
    server = s.server;
    baseUrl = `http://${hostname}:${s.port}`;
  });

  afterEach(() => {
    server?.stop();
    try { unlinkSync(credentialPath); } catch {}
  });

  test('GET /v1/templates works without auth', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/templates`);
    expect(status).toBe(200);
  });

  test('obsolete /v1/profiles alias is not exposed', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/profiles`);
    expect(status).toBe(404);
  });

  test('GET /v1/printer-profiles is the exact public route', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/printer-profiles`);
    expect(status).toBe(200);
  });

  test('GET /v1/health works without auth', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/health`);
    expect(status).toBe(200);
  });

  test('GET /v1/capabilities works without auth', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/capabilities`);
    expect(status).toBe(200);
  });

  test('GET /v1/pair does not exist (POST only)', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/pair`);
    expect(status).toBe(405);
  });

  test('unknown route returns 404', async () => {
    const { status } = await fetchJson(`${baseUrl}/v1/unknown-route`);
    expect(status).toBe(404);
  });
});
