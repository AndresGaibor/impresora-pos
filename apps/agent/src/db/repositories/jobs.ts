import { Database } from 'bun:sqlite';

export type JobState = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';

export interface JobMetadata {
  jobId: string;
  type: string;
  profileId: string | null;
  state: JobState;
  reprintOf: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number | null;
  errorCode: string | null;
}

export class JobAlreadyExistsError extends Error {
  constructor() {
    super('Job already exists');
    this.name = 'JobAlreadyExistsError';
  }
}

export class JobMetadataRepository {
  constructor(private db: Database) {}

  reserve(job: { jobId: string; type: string; profileId: string }): void {
    const existing = this.db.query('SELECT job_id FROM print_jobs WHERE job_id = ?').get(job.jobId);
    if (existing) {
      throw new JobAlreadyExistsError();
    }
    this.db.query(`
      INSERT INTO print_jobs (job_id, type, profile_id, state)
      VALUES (?, ?, ?, 'QUEUED')
    `).run(job.jobId, job.type, job.profileId);
  }

  find(jobId: string): JobMetadata | null {
    const row = this.db.query(`
      SELECT job_id, type, profile_id, state, reprint_of,
             created_at, updated_at, duration_ms, error_code
      FROM print_jobs WHERE job_id = ?
    `).get(jobId) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      jobId: row['job_id'] as string,
      type: row['type'] as string,
      profileId: row['profile_id'] as string | null,
      state: row['state'] as JobState,
      reprintOf: row['reprint_of'] as string | null,
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      durationMs: row['duration_ms'] as number | null,
      errorCode: row['error_code'] as string | null,
    };
  }

  recent(limit: number): JobMetadata[] {
    const rows = this.db.query(`SELECT job_id, type, profile_id, state, reprint_of, created_at, updated_at, duration_ms, error_code FROM print_jobs ORDER BY updated_at DESC LIMIT ?`).all(limit) as Array<Record<string, unknown>>;
    return rows.map(row => ({ jobId: row['job_id'] as string, type: row['type'] as string, profileId: row['profile_id'] as string | null, state: row['state'] as JobState, reprintOf: row['reprint_of'] as string | null, createdAt: row['created_at'] as number, updatedAt: row['updated_at'] as number, durationMs: row['duration_ms'] as number | null, errorCode: row['error_code'] as string | null }));
  }

  markSending(jobId: string): void {
    this.db.query(`
      UPDATE print_jobs SET state = 'SENDING', updated_at = unixepoch()
      WHERE job_id = ?
    `).run(jobId);
  }

  markSent(jobId: string, durationMs: number): void {
    this.db.query(`
      UPDATE print_jobs SET state = 'SENT', duration_ms = ?, updated_at = unixepoch()
      WHERE job_id = ?
    `).run(durationMs, jobId);
  }

  markFailed(jobId: string, errorCode: string): void {
    this.db.query(`
      UPDATE print_jobs SET state = 'FAILED', error_code = ?, updated_at = unixepoch()
      WHERE job_id = ?
    `).run(errorCode, jobId);
  }

  markUnknown(jobId: string): void {
    this.db.query(`
      UPDATE print_jobs SET state = 'UNKNOWN', updated_at = unixepoch()
      WHERE job_id = ?
    `).run(jobId);
  }

  deleteTerminalOlderThan(cutoff: number): number {
    const result = this.db.query(`
      DELETE FROM print_jobs
      WHERE updated_at < ? AND state IN ('SENT', 'FAILED')
    `).run(cutoff);
    return result.changes;
  }
}
