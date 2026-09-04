import type { Database } from 'bun:sqlite';
import { JobMetadataRepository } from '../db/repositories/jobs';
import { PrinterProfileRepository } from '../db/repositories/profiles';
import { NetworkPrinterTransport } from '../transports/network';

export class Recovery {
  constructor(opts: {
    db: Database;
    jobRepo: JobMetadataRepository;
    profileRepo: PrinterProfileRepository;
    transport: NetworkPrinterTransport;
  }) {
    this.db = opts.db;
    this.jobRepo = opts.jobRepo;
    this.profileRepo = opts.profileRepo;
    this.transport = opts.transport;
  }

  private db: Database;
  private jobRepo: JobMetadataRepository;
  private profileRepo: PrinterProfileRepository;
  private transport: NetworkPrinterTransport;

  async recoverInterruptedJobs(): Promise<void> {
    const rows = this.db.query(`SELECT job_id FROM print_jobs WHERE state = 'SENDING'`).all() as Array<{ job_id: string }>;
    for (const row of rows) {
      this.jobRepo.markUnknown(row.job_id);
    }
  }
}
