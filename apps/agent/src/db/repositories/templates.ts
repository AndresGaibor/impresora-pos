import { Database } from 'bun:sqlite';

export interface Template {
  id: string;
  name: string;
  type: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'builtin' | 'managed' | 'local';
  revision: number;
  ownerOrigin: string | null;
}

export class TemplateRepository {
  constructor(private db: Database) {}

  save(template: { id: string; name: string; type: string; content: string; source?: Template['source']; revision?: number; ownerOrigin?: string | null }): void {
    this.db.query(`
      INSERT OR REPLACE INTO templates (id, name, type, content, source, revision, owner_origin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(template.id, template.name, template.type, template.content, template.source ?? 'local', template.revision ?? 1, template.ownerOrigin ?? null);
  }

  find(id: string): Template | null {
    const row = this.db.query(`
      SELECT id, name, type, content, source, revision, owner_origin, created_at, updated_at
      FROM templates WHERE id = ?
    `).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      type: row['type'] as string,
      content: row['content'] as string,
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      source: (row['source'] as Template['source']) ?? 'local',
      revision: (row['revision'] as number) ?? 1,
      ownerOrigin: (row['owner_origin'] as string | null) ?? null,
    };
  }

  findByType(type: string): Template[] {
    const rows = this.db.query(`
      SELECT id, name, type, content, source, revision, owner_origin, created_at, updated_at
      FROM templates WHERE type = ?
    `).all(type) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: row['id'] as string,
      name: row['name'] as string,
      type: row['type'] as string,
      content: row['content'] as string,
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      source: (row['source'] as Template['source']) ?? 'local',
      revision: (row['revision'] as number) ?? 1,
      ownerOrigin: (row['owner_origin'] as string | null) ?? null,
    }));
  }

  all(): Template[] {
    const rows = this.db.query('SELECT id, name, type, content, source, revision, owner_origin, created_at, updated_at FROM templates').all() as Array<Record<string, unknown>>;
    return rows.map(row => ({ id: row['id'] as string, name: row['name'] as string, type: row['type'] as string, content: row['content'] as string, source: (row['source'] as Template['source']) ?? 'local', revision: (row['revision'] as number) ?? 1, ownerOrigin: (row['owner_origin'] as string | null) ?? null, createdAt: row['created_at'] as number, updatedAt: row['updated_at'] as number }));
  }

  delete(id: string): void {
    this.db.query('DELETE FROM templates WHERE id = ?').run(id);
  }
}
