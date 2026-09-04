import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, JobMetadataRepository } from '../src/db/database';
import { cleanupRetention, startAgent, type AgentRuntime } from '../src/index';
import { resolveAgentPaths } from '../src/config/paths';
import { readRuntimeConfig } from '../src/config/runtime';
import type { PrinterTransport } from '@impresora-pos/printer-core/src/types';

const agents: AgentRuntime[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const agent of agents.splice(0)) agent.stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'impresora-pos-agent-'));
  dirs.push(dir);
  return dir;
}

describe('agent startup composition', () => {
  test('keeps the production loopback default and requires explicit ephemeral opt-in', () => {
    expect(readRuntimeConfig({})).toMatchObject({ hostname: '127.0.0.1', port: 18181 });
    expect(() => readRuntimeConfig({}, { port: 0 })).toThrow('Invalid PORT');
    expect(readRuntimeConfig({}, { port: 0, allowEphemeralPort: true })).toMatchObject({ port: 0, allowEphemeralPort: true });
  });

  test('migrates, recovers interrupted jobs, serves health, and installs no polling interval', async () => {
    const dir = dataDir();
    let discoverCalls = 0;
    let probeCalls = 0;
    const fakeSystem: PrinterTransport = {
      discover: async () => { discoverCalls++; return []; },
      probe: async device => { probeCalls++; return { device, reachable: false }; },
      print: async () => ({ success: true, bytesSent: 0 }),
    };
    const first = await startAgent({ dataDir: dir, port: 0, allowEphemeralPort: true, approvedOrigins: [], systemTransport: fakeSystem });
    first.db.query("INSERT INTO print_jobs (job_id, type, profile_id, state) VALUES ('interrupted', 'test', NULL, 'SENDING')").run();
    first.stop();

    const second = await startAgent({ dataDir: dir, port: 0, allowEphemeralPort: true, approvedOrigins: [], systemTransport: fakeSystem });
    agents.push(second);
    const response = await fetch(`http://127.0.0.1:${second.port}/v1/health`);
    expect(response.status).toBe(200);
    expect(second.db.query("SELECT state FROM print_jobs WHERE job_id = 'interrupted'").get()).toEqual({ state: 'UNKNOWN' });
    expect(second.pollingIntervals).toBe(0);
    expect(discoverCalls).toBe(0);
    expect(probeCalls).toBe(0);
    expect(second.paths.database).not.toBe(second.paths.logDirectory);
  });

  test('fails with typed PORT_IN_USE rather than selecting another port', async () => {
    const first = await startAgent({ dataDir: dataDir(), port: 0, allowEphemeralPort: true, approvedOrigins: [] });
    agents.push(first);
    await expect(startAgent({ dataDir: dataDir(), port: first.port, approvedOrigins: [] })).rejects.toMatchObject({ code: 'PORT_IN_USE' });
  });

  test('retains only recent and non-terminal jobs, and does not clean again within 24 hours', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const jobs = new JobMetadataRepository(db);
    const old = Math.floor(Date.now() / 1000) - 40 * 24 * 60 * 60;
    for (const [jobId, state] of [['sent-old', 'SENT'], ['failed-old', 'FAILED'], ['queued-old', 'QUEUED'], ['sending-old', 'SENDING'], ['unknown-old', 'UNKNOWN']] as const) {
      db.query('INSERT INTO print_jobs (job_id, type, state, updated_at) VALUES (?, ?, ?, ?)').run(jobId, 'test', state, old);
    }
    const first = cleanupRetention(db, jobs, 30);
    expect(first.ran).toBe(true);
    expect(first.deleted).toBe(2);
    expect(first.lastCleanupAt).toBeGreaterThan(0);
    expect(db.query('SELECT COUNT(*) AS count FROM print_jobs').get()).toEqual({ count: 3 });
    db.query("INSERT INTO print_jobs (job_id, type, state, updated_at) VALUES ('failed-after-cleanup', 'test', 'FAILED', ?)").run(old);
    const second = cleanupRetention(db, jobs, 30);
    expect(second.ran).toBe(false);
    expect(second.lastCleanupAt).toBe(first.lastCleanupAt);
    expect(jobs.find('failed-after-cleanup')).not.toBeNull();
    db.close();
  });

  test('uses per-user Windows application data paths and separates sensitive files', () => {
    const appData = dataDir();
    const paths = resolveAgentPaths(undefined, { APPDATA: appData }, 'win32');
    expect(paths.dataDirectory).toBe(join(appData, 'ImpresoraPOS'));
    expect(paths.database).toContain(join('ImpresoraPOS', 'db'));
    expect(paths.logDirectory).toContain(join('ImpresoraPOS', 'logs'));
    expect(paths.credentialFile).toContain(join('ImpresoraPOS', 'credentials'));
    expect(paths.database).not.toBe(paths.credentialFile);
  });
});
