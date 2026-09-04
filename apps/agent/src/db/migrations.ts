import { Database } from 'bun:sqlite';

export const SCHEMA_VERSION = 4;

export function migrate(db: Database): void {
  db.exec('PRAGMA journal_mode = WAL');

  const userVersion = db.query('PRAGMA user_version').get() as { user_version: number };

  if (userVersion.user_version > SCHEMA_VERSION) {
    throw new Error(`Database schema version ${userVersion.user_version} is newer than binary supports (${SCHEMA_VERSION})`);
  }

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (unixepoch())
      );
    `);

    const applied = db.query('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>;
    const appliedSet = new Set(applied.map(r => r.version));

    if (!appliedSet.has(1)) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS print_jobs (
          job_id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          profile_id TEXT,
          state TEXT NOT NULL DEFAULT 'QUEUED',
          reprint_of TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          duration_ms INTEGER,
          error_code TEXT
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS pairings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT UNIQUE NOT NULL,
          origin TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch())
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS printer_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          connection TEXT NOT NULL,
          paper_width_mm INTEGER DEFAULT 80,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      db.exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)');
    }

    if (!appliedSet.has(2)) {
      db.exec(`
        ALTER TABLE templates ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
        ALTER TABLE templates ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE IF NOT EXISTS admin_credentials (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          token_hash TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch())
        );
      `);
      db.exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)');
    }

    if (!appliedSet.has(3)) {
      db.exec(`ALTER TABLE printer_profiles ADD COLUMN profile_data TEXT NOT NULL DEFAULT '{}';`);
      db.exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (3)');
    }

    if (!appliedSet.has(4)) {
      db.exec('ALTER TABLE templates ADD COLUMN owner_origin TEXT');
      db.exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (4)');
    }

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
