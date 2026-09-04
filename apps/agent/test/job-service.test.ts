import { Database } from 'bun:sqlite';
import { openDatabase, migrate, JobMetadataRepository, PrinterProfileRepository, TemplateRepository } from '../src/db/database';
import { JobService } from '../src/jobs/job-service';
import { Recovery } from '../src/jobs/recovery';
import { NetworkPrinterTransport } from '../src/transports/network';
import { ProfileService } from '../src/services/profile-service';
import type { PrinterDevice } from '@impresora-pos/printer-core/src/types';
import { describe, test, expect, beforeEach } from 'bun:test';

function createTestDb(): Database {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

type SendResult = { success: boolean; bytesSent: number };
type SendFn = (device: PrinterDevice, bytes: Uint8Array) => Promise<SendResult>;

class FakeTransport {
  private calls = new Map<string, number>();
  private concurrent = new Map<string, number>();
  private maxConcurrent = new Map<string, number>();
  private sendFn: SendFn;

  constructor(sendFn?: SendFn) {
    this.sendFn = sendFn ?? (() => Promise.resolve({ success: true, bytesSent: 0 }));
  }

  async print(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult> {
    return this.send(device, bytes);
  }

  async send(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult> {
    const deviceExt = device as { profileId?: string; jobId?: string };
    const profileId = deviceExt.profileId ?? 'unknown';
    const jobId = deviceExt.jobId ?? 'unknown';
    this.calls.set(profileId, (this.calls.get(profileId) ?? 0) + 1);
    if (jobId !== 'unknown') {
      this.calls.set(jobId, (this.calls.get(jobId) ?? 0) + 1);
    }
    this.concurrent.set(profileId, (this.concurrent.get(profileId) ?? 0) + 1);
    const current = this.concurrent.get(profileId)!;
    if (current > (this.maxConcurrent.get(profileId) ?? 0)) {
      this.maxConcurrent.set(profileId, current);
    }
    try {
      return await this.sendFn(device, bytes);
    } finally {
      this.concurrent.set(profileId, this.concurrent.get(profileId)! - 1);
    }
  }

  close(): void {}

  callsFor(jobId: string): number {
    return this.calls.get(jobId) ?? 0;
  }

  maxConcurrentForProfile(profileId: string): number {
    return this.maxConcurrent.get(profileId) ?? 0;
  }
}

describe('JobService - idempotency and queue', () => {
  let db: Database;
  let jobRepo: JobMetadataRepository;
  let profileRepo: PrinterProfileRepository;
  let templateRepo: TemplateRepository;
  let fakeTransport: FakeTransport;

  beforeEach(() => {
    db = createTestDb();
    jobRepo = new JobMetadataRepository(db);
    profileRepo = new PrinterProfileRepository(db);
    templateRepo = new TemplateRepository(db);
    fakeTransport = new FakeTransport();

    profileRepo.save({ id: 'p1', name: 'Printer 1', connection: { type: 'network', host: '127.0.0.1', port: 9100 }, paperWidthMm: 80 });
    profileRepo.save({ id: 'p2', name: 'Printer 2', connection: { type: 'network', host: '127.0.0.2', port: 9100 }, paperWidthMm: 80 });
    templateRepo.save({
      id: 't1',
      name: 'Invoice',
      type: 'invoice',
      content: JSON.stringify({
        id: 't1',
        name: 'Invoice',
        source: 'local',
        paperWidth: 80,
        blocks: [{ type: 'text', content: 'Invoice' }],
      }),
    });
  });

  test('duplicate jobId returns durable prior status without transport call', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });

    const result1 = await service.submit({ jobId: 'job-a', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    expect(result1.jobId).toBe('job-a');

    const result2 = await service.submit({ jobId: 'job-a', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    expect(result2.jobId).toBe('job-a');
    expect(fakeTransport.callsFor('job-a')).toBe(1);
  });

  test('concurrent submit with same jobId is idempotent - single transport call', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });

    const [r1, r2] = await Promise.all([
      service.submit({ jobId: 'job-concurrent', type: 'invoice', profileId: 'p1', payload: { amount: 100 } }),
      service.submit({ jobId: 'job-concurrent', type: 'invoice', profileId: 'p1', payload: { amount: 100 } }),
    ]);

    expect(r1.jobId).toBe('job-concurrent');
    expect(r2.jobId).toBe('job-concurrent');
    expect(r1.state).toBe(r2.state);
    expect(fakeTransport.callsFor('job-concurrent')).toBe(1);
  });

  test('per-profile serial queue enforces one concurrent transport call', async () => {
    const callLog: string[] = [];
    const slowFakeTransport = new FakeTransport(async (device) => {
      callLog.push(`start:${(device as { profileId?: string }).profileId}`);
      await new Promise(r => setTimeout(r, 50));
      callLog.push(`end:${(device as { profileId?: string }).profileId}`);
      return { success: true, bytesSent: 0 };
    });

    const service = new JobService({ db, profileRepo, templateRepo, transport: slowFakeTransport as unknown as NetworkPrinterTransport });

    await Promise.all([
      service.submit({ jobId: 'job-b', type: 'invoice', profileId: 'p1', payload: { amount: 1 } }),
      service.submit({ jobId: 'job-c', type: 'invoice', profileId: 'p1', payload: { amount: 2 } }),
    ]);

    expect(slowFakeTransport.maxConcurrentForProfile('p1')).toBe(1);
  });

  test('recoverInterruptedJobs maps SENDING to UNKNOWN without auto-reprint', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });

    await service.submit({ jobId: 'job-d', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });

    db.query(`UPDATE print_jobs SET state = 'SENDING' WHERE job_id = 'job-d'`).run();

    const recovery = new Recovery({ db, jobRepo, profileRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });
    await recovery.recoverInterruptedJobs();

    const job = jobRepo.find('job-d');
    expect(job?.state).toBe('UNKNOWN');
    expect(fakeTransport.callsFor('job-d')).toBe(1);
  });

  test('reprintOf requires new jobId', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });

    await service.submit({ jobId: 'job-e', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    const reprint = await service.submit({ jobId: 'job-f', type: 'invoice', profileId: 'p1', payload: { amount: 100 }, reprintOf: 'job-e' });

    expect(reprint.jobId).toBe('job-f');
    expect(jobRepo.find('job-f')?.reprintOf).toBe('job-e');
    expect(jobRepo.find('job-e')?.state).toBe('SENT');
  });

  test('submit returns correct jobId', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });
    const result = await service.submit({ jobId: 'job-g', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    expect(result.jobId).toBe('job-g');
    expect(result.state).toBeDefined();
  });

  test('getStatus returns current state', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });
    await service.submit({ jobId: 'job-h', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    const status = await service.getStatus('job-h');
    expect(status?.jobId).toBe('job-h');
  });

  test('failed print transitions to FAILED', async () => {
    const failingTransport = new FakeTransport(async () => {
      throw new Error('print error');
    });
    const service = new JobService({ db, profileRepo, templateRepo, transport: failingTransport as unknown as NetworkPrinterTransport });
    const result = await service.submit({ jobId: 'job-i', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    expect(result.state).toBe('FAILED');
  });

  test('successful print transitions to SENT', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });
    const result = await service.submit({ jobId: 'job-j', type: 'invoice', profileId: 'p1', payload: { amount: 100 } });
    expect(result.state).toBe('SENT');
  });

  test('payload not persisted - print_jobs schema has no payload column', () => {
    const columns = db.query("PRAGMA table_info(print_jobs)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    expect(columnNames).not.toContain('payload');
  });

  test('failed print releases payload reference after FAILED', async () => {
    const capturedPayloads: unknown[] = [];
    const trackingTransport = new FakeTransport(async (device, bytes) => {
      const d = device as { jobId?: string };
      if (d.jobId === 'job-payload-fail') {
        capturedPayloads.push(bytes);
      }
      throw new Error('print error');
    });
    const service = new JobService({ db, profileRepo, templateRepo, transport: trackingTransport as unknown as NetworkPrinterTransport });
    const payload = { amount: 999 };
    await service.submit({ jobId: 'job-payload-fail', type: 'invoice', profileId: 'p1', payload });
    const status = await service.getStatus('job-payload-fail');
    expect(status?.state).toBe('FAILED');
    const job = jobRepo.find('job-payload-fail');
    expect(job?.errorCode).toBe('print error');
  });

  test('successful print releases payload reference after SENT', async () => {
    const service = new JobService({ db, profileRepo, templateRepo, transport: fakeTransport as unknown as NetworkPrinterTransport });
    const payload = { amount: 123 };
    await service.submit({ jobId: 'job-payload-ok', type: 'invoice', profileId: 'p1', payload });
    const status = await service.getStatus('job-payload-ok');
    expect(status?.state).toBe('SENT');
    const job = jobRepo.find('job-payload-ok');
    expect(job?.state).toBe('SENT');
    expect(job?.errorCode).toBeNull();
  });

  test('renders declarative template to ESC/POS bytes before transport', async () => {
    let printed: Uint8Array | undefined;
    const transport = new FakeTransport(async (_device, bytes) => {
      printed = bytes;
      return { success: true, bytesSent: bytes.length };
    });
    const service = new JobService({ db, profileRepo, templateRepo, transport: transport as unknown as NetworkPrinterTransport });

    const result = await service.submit({ jobId: 'job-bytes', type: 'invoice', profileId: 'p1', payload: {} });

    expect(result.state).toBe('SENT');
    expect(printed).toBeDefined();
    expect(Array.from(printed!.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(new TextDecoder().decode(printed)).toContain('Invoice');
  });

  test('maps SendResult.success false to FAILED with error code', async () => {
    const transport = new FakeTransport(async () => ({ success: false, bytesSent: 0 }));
    const service = new JobService({ db, profileRepo, templateRepo, transport: transport as unknown as NetworkPrinterTransport });

    const result = await service.submit({ jobId: 'job-send-false', type: 'invoice', profileId: 'p1', payload: {} });

    expect(result.state).toBe('FAILED');
    expect(result.errorCode).toBe('PRINTER_SEND_FAILED');
  });

  test('saved 58mm custom profile drives render and transport values', async () => {
    const profile = new ProfileService(profileRepo);
    const saved = profile.save({
      id: 'custom-58',
      name: 'Custom 58',
      transport: 'network',
      device: { kind: 'network', host: '192.168.1.20', port: 9200 },
      language: 'esc-pos',
      paperWidthMm: 58,
      columns: 24,
      codepageMapping: 'custom',
      cut: true,
      drawer: true,
      defaultTemplates: { invoice: 't-custom' },
      hardwareState: 'reachable',
      testMetadata: { lastTestAt: '2026-09-04T00:00:00.000Z', result: 'pass' },
    });
    templateRepo.save({
      id: 't-custom', name: 'Custom invoice', type: 'invoice',
      content: JSON.stringify({ id: 't-custom', name: 'Custom invoice', source: 'local', paperWidth: 58, blocks: [{ type: 'text', content: 'custom' }] }),
    });
    let printedDevice: PrinterDevice | undefined;
    let printedBytes: Uint8Array | undefined;
    const transport = new FakeTransport(async (device, bytes) => {
      printedDevice = device;
      printedBytes = bytes;
      return { success: true, bytesSent: bytes.length };
    });
    const service = new JobService({ db, profileRepo, templateRepo, transport: transport as unknown as NetworkPrinterTransport });

    await service.submit({ jobId: 'job-custom-profile', type: 'invoice', profileId: saved.id, payload: {} });

    expect(profile.get(saved.id)).toEqual(saved);
    expect(printedDevice).toMatchObject({ kind: 'network', host: '192.168.1.20', port: 9200, profileId: saved.id });
    expect(printedBytes).toBeDefined();
    expect(Array.from(printedBytes!.slice(-5))).toEqual([0x1b, 0x70, 0x00, 0x64, 0xfa]);
  });
});
