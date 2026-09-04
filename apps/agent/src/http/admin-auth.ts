import type { Database } from 'bun:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export function provisionAdminCredential(db: Database, path: string): string | null {
  mkdirSync(dirname(path), { recursive: true });
  db.exec('PRAGMA busy_timeout = 100');
  for (let attempt = 0; attempt < 8; attempt++) {
    let token = '';
    try {
      db.exec('BEGIN IMMEDIATE');
      const current = db.query('SELECT token_hash FROM admin_credentials WHERE id = 1').get() as { token_hash: string } | null;
      if (current) {
        if (!existsSync(path)) throw new Error('ADMIN_CREDENTIAL_FILE_MISSING');
        if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
        const fileToken = readFileSync(path, 'utf8').trim();
        if (!safeEqual(hashAdminToken(fileToken), current.token_hash)) throw new Error('ADMIN_CREDENTIAL_INCONSISTENT');
        db.exec('COMMIT');
        return null;
      }
      if (existsSync(path)) {
        if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
        throw new Error('ADMIN_CREDENTIAL_FILE_EXISTS');
      }
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Buffer.from(bytes).toString('base64url');
      db.query('INSERT INTO admin_credentials (id, token_hash) VALUES (1, ?)').run(hashAdminToken(token));
      writeFileSync(path, `${token}\n`, { mode: 0o600, flag: 'wx' });
      chmodSync(path, 0o600);
      db.exec('COMMIT');
      return token;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      try { if (token && readFileSync(path, 'utf8').trim() === token) unlinkSync(path); } catch {}
      if (!isBusyError(error) || attempt === 7) throw error;
      const delayMs = 5 * 2 ** attempt;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
  throw new Error('ADMIN_CREDENTIAL_PROVISIONING_FAILED');
}

export function verifyAdminRequest(req: Request, db: Database, approvedOrigins: string[]): { ok: boolean; status: number; code: string } {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin || !approvedOrigins.includes(origin)) return { ok: false, status: 403, code: origin ? 'FORBIDDEN_ORIGIN' : 'MISSING_ORIGIN' };
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { ok: false, status: 401, code: 'MISSING_TOKEN' };
  const row = db.query('SELECT token_hash FROM admin_credentials WHERE id = 1').get() as { token_hash: string } | null;
  if (!row || !safeEqual(hashAdminToken(token), row.token_hash)) return { ok: false, status: 401, code: 'INVALID_TOKEN' };
  return { ok: true, status: 200, code: '' };
}

export function readProvisionedAdminToken(path: string): string {
  return readFileSync(path, 'utf8').trim();
}

const MAX_ADMIN_BODY_BYTES = 1024 * 1024;
export async function readAdminJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; code: string; message: string; status: number }> {
  const declared = Number(req.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_ADMIN_BODY_BYTES) return { ok: false, code: 'BODY_TOO_LARGE', message: 'Request body too large', status: 413 };
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_ADMIN_BODY_BYTES) return { ok: false, code: 'BODY_TOO_LARGE', message: 'Request body too large', status: 413 };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON body', status: 400 };
  }
}

function hashAdminToken(token: string): string { return `sha256:${createHash('sha256').update(token).digest('hex')}`; }
function safeEqual(a: string, b: string): boolean { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|database table is locked|SQLITE_BUSY/i.test(message);
}
