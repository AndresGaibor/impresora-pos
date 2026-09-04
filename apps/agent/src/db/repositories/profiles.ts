import { Database } from 'bun:sqlite';

export interface PrinterProfile {
  id: string;
  name: string;
  connection: { type: string; host?: string; port?: number; devicePath?: string } | { type: 'usb'; vendorId?: number; productId?: number };
  paperWidthMm: number;
  createdAt: number;
  updatedAt: number;
  profileData: Record<string, unknown>;
}

export class PrinterProfileRepository {
  constructor(private db: Database) {}

  save(profile: { id: string; name: string; connection: PrinterProfile['connection']; paperWidthMm?: number; profileData?: Record<string, unknown> }): void {
    const connectionJson = JSON.stringify(profile.connection);
    this.db.query(`
      INSERT OR REPLACE INTO printer_profiles (id, name, connection, paper_width_mm, profile_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(profile.id, profile.name, connectionJson, profile.paperWidthMm ?? 80, JSON.stringify(profile.profileData ?? {}));
  }

  find(id: string): PrinterProfile | null {
    const row = this.db.query(`
      SELECT id, name, connection, paper_width_mm, profile_data, created_at, updated_at
      FROM printer_profiles WHERE id = ?
    `).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      connection: JSON.parse(row['connection'] as string),
      paperWidthMm: row['paper_width_mm'] as number,
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      profileData: JSON.parse((row['profile_data'] as string | undefined) ?? '{}'),
    };
  }

  all(): PrinterProfile[] {
    const rows = this.db.query('SELECT id, name, connection, paper_width_mm, profile_data, created_at, updated_at FROM printer_profiles').all() as Array<Record<string, unknown>>;
    return rows.map(row => ({ id: row['id'] as string, name: row['name'] as string, connection: JSON.parse(row['connection'] as string), paperWidthMm: row['paper_width_mm'] as number, profileData: JSON.parse((row['profile_data'] as string | undefined) ?? '{}'), createdAt: row['created_at'] as number, updatedAt: row['updated_at'] as number }));
  }

  delete(id: string): void {
    this.db.query('DELETE FROM printer_profiles WHERE id = ?').run(id);
  }
}
