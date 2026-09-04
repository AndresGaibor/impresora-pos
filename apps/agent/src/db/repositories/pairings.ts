import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';

export interface PairingMetadata {
  id: number;
  tokenHash: string;
  origin: string;
  createdAt: number;
}

export class PairingMetadataRepository {
  constructor(private db: Database) {}

  approve(pairing: { token: string; origin: string }): void {
    const tokenHash = `sha256:${createHash('sha256').update(pairing.token).digest('hex')}`;
    this.db.query(`
      INSERT OR REPLACE INTO pairings (token_hash, origin)
      VALUES (?, ?)
    `).run(tokenHash, pairing.origin);
  }

  findByTokenHash(tokenHash: string): PairingMetadata | null {
    const row = this.db.query(`
      SELECT id, token_hash, origin, created_at
      FROM pairings WHERE token_hash = ?
    `).get(tokenHash) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row['id'] as number,
      tokenHash: row['token_hash'] as string,
      origin: row['origin'] as string,
      createdAt: row['created_at'] as number,
    };
  }

  revoke(tokenHash: string): void {
    this.db.query('DELETE FROM pairings WHERE token_hash = ?').run(tokenHash);
  }
}
