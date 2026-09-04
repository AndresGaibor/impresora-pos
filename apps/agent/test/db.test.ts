import { Database } from 'bun:sqlite';
import { openDatabase, migrate, SCHEMA_VERSION, JobMetadataRepository, JobAlreadyExistsError, PairingMetadataRepository, PrinterProfileRepository, TemplateRepository } from '../src/db/database';
import { unlinkSync } from 'fs';
import { describe, test, expect } from 'bun:test';

function createTestDb(): Database {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

describe('JobMetadataRepository', () => {
  test('reserve sets state to QUEUED', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    expect(repo.find('A')?.state).toBe('QUEUED');
  });

  test('reserve throws JobAlreadyExistsError on duplicate jobId', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    expect(() => repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' })).toThrow(JobAlreadyExistsError);
  });

  test('print_jobs has no PII columns', () => {
    const db = createTestDb();
    const columns = db.query("PRAGMA table_info(print_jobs)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    expect(columnNames).not.toContain('payload');
    expect(columnNames).not.toContain('customer');
    expect(columnNames).not.toContain('items');
    expect(columnNames).not.toContain('document');
    expect(columnNames).not.toContain('token');
  });

  test('profile_data has no job or customer payload fields', () => {
    const db = createTestDb();
    const repo = new PrinterProfileRepository(db);
    repo.save({
      id: 'profile-pii-check',
      name: 'Kitchen',
      connection: { type: 'network', host: '127.0.0.1', port: 9100 },
      profileData: { columns: 24, language: 'esc-pos' },
    });
    const row = db.query('SELECT profile_data FROM printer_profiles WHERE id = ?').get('profile-pii-check') as { profile_data: string };
    const profileData = JSON.parse(row.profile_data) as Record<string, unknown>;
    for (const key of ['payload', 'customer', 'items', 'document', 'token']) {
      expect(Object.prototype.hasOwnProperty.call(profileData, key)).toBe(false);
    }
  });

  test('markSending transitions QUEUED to SENDING', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    repo.markSending('A');
    expect(repo.find('A')?.state).toBe('SENDING');
  });

  test('markSent transitions SENDING to SENT', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    repo.markSending('A');
    repo.markSent('A', 1500);
    expect(repo.find('A')?.state).toBe('SENT');
    expect(repo.find('A')?.durationMs).toBe(1500);
  });

  test('markFailed transitions to FAILED with error_code', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    repo.markSending('A');
    repo.markFailed('A', 'E_PAPER_OUT');
    expect(repo.find('A')?.state).toBe('FAILED');
    expect(repo.find('A')?.errorCode).toBe('E_PAPER_OUT');
  });

  test('markUnknown transitions to UNKNOWN', () => {
    const db = createTestDb();
    const repo = new JobMetadataRepository(db);
    repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
    repo.markUnknown('A');
    expect(repo.find('A')?.state).toBe('UNKNOWN');
  });
});

describe('migration', () => {
  test('migration v4 creates profile_data, managed ownership and records schema version', () => {
    const db = createTestDb();
    const columns = db.query('PRAGMA table_info(printer_profiles)').all() as Array<{ name: string }>;
    expect(columns.map(column => column.name)).toContain('profile_data');
    const templateColumns = db.query('PRAGMA table_info(templates)').all() as Array<{ name: string }>;
    expect(templateColumns.map(column => column.name)).toContain('owner_origin');
    expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(4);
    expect((db.query('SELECT version FROM schema_migrations WHERE version = 3').get() as { version: number }).version).toBe(3);
  });

  test('migrate throws when DB schema version is newer than binary', () => {
    const db = openDatabase(':memory:');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(`Database schema version ${SCHEMA_VERSION + 1} is newer than binary supports`);
    db.close();
  });
});

describe('migration idempotency', () => {
  test('running migrate twice does not corrupt data', () => {
    const tmp = '/tmp/test_db_' + Math.random().toString(36).slice(2);
    const db1 = new Database(tmp);
    migrate(db1);
    const repo1 = new JobMetadataRepository(db1);
    repo1.reserve({ jobId: 'X', type: 'receipt', profileId: 'p1' });
    db1.close();

    const db2 = new Database(tmp);
    migrate(db2);
    const repo2 = new JobMetadataRepository(db2);
    expect(repo2.find('X')?.state).toBe('QUEUED');
    expect(repo2.find('X')?.type).toBe('receipt');
    expect(repo2.find('X')?.profileId).toBe('p1');
    db2.close();

    try { unlinkSync(tmp); } catch {}
  });

  test('reopen temporary file DB preserves metadata', () => {
    const tmp = '/tmp/test_db_persist_' + Math.random().toString(36).slice(2);
    {
      const db = new Database(tmp);
      migrate(db);
      const repo = new JobMetadataRepository(db);
      repo.reserve({ jobId: 'Y', type: 'cash-close', profileId: 'p2' });
      repo.markSending('Y');
      db.close();
    }
    {
      const db = new Database(tmp);
      migrate(db);
      const repo = new JobMetadataRepository(db);
      const job = repo.find('Y');
      expect(job?.state).toBe('SENDING');
      expect(job?.type).toBe('cash-close');
      db.close();
    }
    try { unlinkSync(tmp); } catch {}
  });
});

describe('PairingMetadataRepository', () => {
  test('stores and retrieves pairing as hash/origin only', () => {
    const db = createTestDb();
    const repo = new PairingMetadataRepository(db);
    const plaintext = 'super-secret-token-456';
    repo.approve({ token: plaintext, origin: 'https://pos.example.com' });
    const storedHash = db.query('SELECT token_hash FROM pairings').get() as { token_hash: string };
    const p = repo.findByTokenHash(storedHash.token_hash);
    expect(p).not.toBeNull();
    expect(p?.tokenHash).toBe(storedHash.token_hash);
    expect(p?.origin).toBe('https://pos.example.com');
  });

  test('approve hashes plaintext token; never stores plaintext', () => {
    const db = createTestDb();
    const repo = new PairingMetadataRepository(db);
    const plaintext = 'super-secret-token-123';
    repo.approve({ token: plaintext, origin: 'https://pos.example.com' });

    const allRows = db.query('SELECT token_hash FROM pairings').all() as Array<{ token_hash: string }>;
    expect(allRows.length).toBe(1);
    expect(allRows[0]?.token_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(allRows[0]?.token_hash).not.toBe(plaintext);
    expect(allRows[0]?.token_hash).not.toContain(plaintext);
  });

  test('findByTokenHash returns null for unknown hash', () => {
    const db = createTestDb();
    const repo = new PairingMetadataRepository(db);
    expect(repo.findByTokenHash('unknown')).toBeNull();
  });
});

describe('PrinterProfileRepository', () => {
  test('save and find profile', () => {
    const db = createTestDb();
    const repo = new PrinterProfileRepository(db);
    repo.save({ id: 'profile1', name: 'Kitchen', connection: { type: 'network', host: '192.168.1.10' }, paperWidthMm: 80 });
    const p = repo.find('profile1');
    expect(p?.id).toBe('profile1');
    expect(p?.name).toBe('Kitchen');
  });
});

describe('TemplateRepository', () => {
  test('save and find template', () => {
    const db = createTestDb();
    const repo = new TemplateRepository(db);
    repo.save({ id: 'tmpl1', name: 'Invoice', type: 'invoice', content: '{}' });
    const t = repo.find('tmpl1');
    expect(t?.id).toBe('tmpl1');
    expect(t?.type).toBe('invoice');
  });
});
