import { Database } from 'bun:sqlite';
import { openDatabase, migrate, JobMetadataRepository, PairingMetadataRepository, PrinterProfileRepository, TemplateRepository } from './db/database';
import { resolveAgentPaths, type AgentPaths } from './config/paths';
import { readRuntimeConfig, type AgentRuntimeConfig } from './config/runtime';
import { Recovery } from './jobs/recovery';
import { JobService } from './jobs/job-service';
import { NetworkPrinterTransport } from './transports/network';
import { SystemPrinterTransport } from './transports/system';
import { createSystemNativeApi } from './transports/system-helper-client';
import { startServer } from './http/server';
import type { PrinterTransport } from '@impresora-pos/printer-core/src/types';

export interface AgentRuntime {
  db: Database;
  port: number;
  paths: AgentPaths;
  pollingIntervals: number;
  retention: { ran: boolean; deleted: number; lastCleanupAt: number };
  stop(): void;
}

export interface StartAgentOptions extends Partial<AgentRuntimeConfig> {
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  networkTransport?: NetworkPrinterTransport;
  systemTransport?: PrinterTransport;
}

export async function startAgent(options: StartAgentOptions = {}): Promise<AgentRuntime> {
  const paths = resolveAgentPaths(options.dataDir, options.env);
  const config = readRuntimeConfig(options.env, options);
  const db = openDatabase(paths.database);
  migrate(db);
  const jobRepo = new JobMetadataRepository(db);
  const profileRepo = new PrinterProfileRepository(db);
  const templateRepo = new TemplateRepository(db);
  const pairingRepo = new PairingMetadataRepository(db);
  const networkTransport = options.networkTransport ?? new NetworkPrinterTransport();
  const systemTransport = options.systemTransport ?? new SystemPrinterTransport(createSystemNativeApi());
  const jobService = new JobService({ db, profileRepo, templateRepo, transports: { network: networkTransport, system: systemTransport } });

  await new Recovery({ db, jobRepo, profileRepo, transport: networkTransport }).recoverInterruptedJobs();
  const retention = cleanupRetention(db, jobRepo, config.jobMetadataRetentionDays);
  let started;
  try {
    started = await startServer({
      hostname: config.hostname,
      port: config.port,
      ...(config.allowEphemeralPort ? { allowEphemeralPort: true } : {}),
      db,
      pairingRepo,
      profileRepo,
      templateRepo,
      jobService,
      networkTransport,
      systemTransport,
      approvedOrigins: config.approvedOrigins,
      adminCredentialPath: paths.credentialFile,
    });
  } catch (error) {
    db.close();
    networkTransport.close();
    throw error;
  }
  return {
    db,
    port: started.port,
    paths,
    pollingIntervals: 0,
    retention,
    stop() { started.server.stop(); networkTransport.close(); db.close(); },
  };
}

export function cleanupRetention(db: Database, jobs: JobMetadataRepository, retentionDays: number): { ran: boolean; deleted: number; lastCleanupAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const last = db.query("SELECT value FROM preferences WHERE key = 'job_metadata_last_cleanup'").get() as { value: string } | null;
  if (last && now - Number(last.value) < 24 * 60 * 60) return { ran: false, deleted: 0, lastCleanupAt: Number(last.value) };
  const deleted = jobs.deleteTerminalOlderThan(now - Math.max(1, retentionDays) * 24 * 60 * 60);
  db.query("INSERT OR REPLACE INTO preferences (key, value) VALUES ('job_metadata_last_cleanup', ?)").run(String(now));
  return { ran: true, deleted, lastCleanupAt: now };
}

if (import.meta.main) {
  startAgent().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
