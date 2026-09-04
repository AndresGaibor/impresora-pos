import type { Database } from 'bun:sqlite';
import { JobMetadataRepository, JobAlreadyExistsError } from '../db/repositories/jobs';
import type { JobState } from '../db/repositories/jobs';
import { PrinterProfileRepository } from '../db/repositories/profiles';
import { TemplateRepository } from '../db/repositories/templates';
import { PrinterProfileSchema, type PrinterTransport, type PrinterDevice, type PrinterProfile } from '@impresora-pos/printer-core/src/types';
import { resolveLayout, encodeEscPos } from '@impresora-pos/renderer';
import { BUILTIN_TEMPLATES, TemplateDefinitionSchema, type TemplateDefinition } from '@impresora-pos/templates';
import { PerProfileQueue, type QueuedJob } from './queue';

const PRINTER_SEND_FAILED = 'PRINTER_SEND_FAILED';

export interface JobInput {
  jobId: string;
  type: string;
  profileId: string;
  templateId?: string;
  payload: unknown;
  actions?: { cut?: boolean; openDrawer?: boolean };
  reprintOf?: string | null;
}

export interface JobStatus {
  jobId: string;
  state: JobState;
  errorCode?: string | null;
}

interface Mutex {
  locked: boolean;
  waiters: Array<() => void>;
}

export class JobService {
  private profileMutexes = new Map<string, Mutex>();
  private jobLocks = new Map<string, Promise<void>>();
  private queue = new PerProfileQueue();

  constructor(opts: {
    db: Database;
    profileRepo: PrinterProfileRepository;
    templateRepo: TemplateRepository;
    transport?: PrinterTransport;
    transports?: Partial<Record<'system' | 'network', PrinterTransport>>;
  }) {
    this.db = opts.db;
    this.jobRepo = new JobMetadataRepository(opts.db);
    this.profileRepo = opts.profileRepo;
    this.templateRepo = opts.templateRepo;
    this.transports = opts.transports ?? (opts.transport ? { network: opts.transport } : {});
  }

  private db: Database;
  private jobRepo: JobMetadataRepository;
  private profileRepo: PrinterProfileRepository;
  private templateRepo: TemplateRepository;
  private transports: Partial<Record<'system' | 'network', PrinterTransport>>;

  async submit(input: JobInput): Promise<JobStatus> {
    await this.acquireJobLock(input.jobId);
    try {
      return await this.doSubmit(input);
    } finally {
      this.releaseJobLock(input.jobId);
    }
  }

  private async acquireJobLock(jobId: string): Promise<void> {
    const existing = this.jobLocks.get(jobId);
    if (existing) {
      await existing;
    }
    let release: () => void;
    const p = new Promise<void>(r => { release = r; });
    this.jobLocks.set(jobId, p);
    (p as { release?: () => void }).release = release!;
  }

  private releaseJobLock(jobId: string): void {
    const p = this.jobLocks.get(jobId);
    if (p) {
      (p as { release?: () => void }).release?.();
      this.jobLocks.delete(jobId);
    }
  }

  private async doSubmit(input: JobInput): Promise<JobStatus> {
    const existing = this.jobRepo.find(input.jobId);
    if (existing) {
      return { jobId: existing.jobId, state: existing.state, errorCode: existing.errorCode };
    }

    const profile = this.profileRepo.find(input.profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${input.profileId}`);
    }

    const templates = this.templateRepo.findByType(input.type);
    if (input.templateId && !this.templateRepo.find(input.templateId) && !BUILTIN_TEMPLATES[input.templateId]) {
      throw new Error(`Template not found: ${input.templateId}`);
    }
    if (templates.length === 0 && !input.templateId) {
      throw new Error(`No template for type: ${input.type}`);
    }

    const reprintOf = input.reprintOf ?? null;

    try {
      this.jobRepo.reserve({ jobId: input.jobId, type: input.type, profileId: input.profileId });
    } catch (err) {
      if (err instanceof JobAlreadyExistsError) {
        const existing = this.jobRepo.find(input.jobId);
        return { jobId: input.jobId, state: existing!.state, errorCode: existing!.errorCode };
      }
      throw err;
    }

    if (reprintOf) {
      this.db.query(`UPDATE print_jobs SET reprint_of = ? WHERE job_id = ?`).run(reprintOf, input.jobId);
    }

    const job: QueuedJob = {
      jobId: input.jobId,
      type: input.type,
      profileId: input.profileId,
      payload: input.payload,
      reprintOf,
      ...(input.templateId ? { templateId: input.templateId } : {}),
      ...(input.actions ? { actions: input.actions } : {}),
    };

    return new Promise<JobStatus>((resolve) => {
      this.queue.enqueue(input.profileId, job);
      this.processQueue(input.profileId, input.jobId, resolve);
    });
  }

  private async processQueue(profileId: string, targetJobId: string, resolve: (s: JobStatus) => void): Promise<void> {
    while (true) {
      if (this.queue.isActive(profileId)) {
        await new Promise(r => setTimeout(r, 5));
        continue;
      }

      const job = this.queue.peek(profileId);
      if (!job) {
        const result = this.jobRepo.find(targetJobId);
        resolve({ jobId: targetJobId, state: result?.state ?? 'UNKNOWN' });
        return;
      }

      if (job.jobId !== targetJobId) {
        await new Promise(r => setTimeout(r, 5));
        continue;
      }

      this.queue.setActive(profileId, true);
      this.queue.dequeue(profileId);

      try {
        await this.executeJob(job);
      } finally {
        this.queue.setActive(profileId, false);
      }

      const result = this.jobRepo.find(targetJobId);
      resolve({ jobId: targetJobId, state: result!.state, errorCode: result!.errorCode });
    }
  }

  private async acquire(profileId: string): Promise<void> {
    let mutex = this.profileMutexes.get(profileId);
    if (!mutex) {
      mutex = { locked: false, waiters: [] };
      this.profileMutexes.set(profileId, mutex);
    }
    if (!mutex.locked) {
      mutex.locked = true;
      return;
    }
    await new Promise<void>(resolve => {
      mutex!.waiters.push(resolve);
    });
  }

  private release(profileId: string): void {
    const mutex = this.profileMutexes.get(profileId);
    if (!mutex) return;
    const next = mutex.waiters.shift();
    if (next) {
      next();
    } else {
      mutex.locked = false;
      this.profileMutexes.delete(profileId);
    }
  }

  async getStatus(jobId: string): Promise<JobStatus | null> {
    const job = this.jobRepo.find(jobId);
    if (!job) return null;
    return { jobId: job.jobId, state: job.state, errorCode: job.errorCode };
  }

  private async executeJob(job: QueuedJob): Promise<void> {
    this.jobRepo.markSending(job.jobId);

    try {
      const profile = this.resolveProfile(job.profileId);
      const device = this.resolveDevice(profile, job.jobId);
      const bytes = this.render(job, profile);
      const start = Date.now();
      const transport = this.transports[device.kind];
      if (!transport) throw new Error(`Unsupported transport: ${device.kind}`);
      const result = await transport.print(device, bytes);
      if (!result.success) {
        throw Object.assign(new Error(PRINTER_SEND_FAILED), { code: PRINTER_SEND_FAILED });
      }
      const duration = Date.now() - start;
      this.jobRepo.markSent(job.jobId, duration);
    } catch (err) {
      const errorCode = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
      this.jobRepo.markFailed(job.jobId, errorCode);
    } finally {
      job.payload = undefined;
    }
  }

  private resolveProfile(profileId: string): PrinterProfile {
    const stored = this.profileRepo.find(profileId);
    if (!stored) throw new Error('PROFILE_NOT_FOUND');
    const connection = stored.connection;
    const paperWidthMm = stored.paperWidthMm === 58 ? 58 : 80;
    const devicePath = 'devicePath' in connection ? connection.devicePath : undefined;
    const device: PrinterDevice = connection.type === 'network'
      ? { kind: 'network', host: connection.host ?? '127.0.0.1', port: connection.port ?? 9100 }
      : { kind: 'system', ...(devicePath ? { devicePath } : {}), deviceName: stored.name };
    return PrinterProfileSchema.parse({
      id: stored.id,
      name: stored.name,
      transport: device.kind,
      device,
      language: (stored.profileData.language as PrinterProfile['language']) ?? 'esc-pos',
      paperWidthMm,
      columns: (stored.profileData.columns as number) ?? (paperWidthMm === 58 ? 32 : 48),
      codepageMapping: (stored.profileData.codepageMapping as PrinterProfile['codepageMapping']) ?? 'epson',
      cut: (stored.profileData.cut as boolean) ?? false,
      drawer: (stored.profileData.drawer as boolean) ?? false,
      ...(stored.profileData.defaultTemplates ? { defaultTemplates: stored.profileData.defaultTemplates as PrinterProfile['defaultTemplates'] } : {}),
      ...(stored.profileData.hardwareState ? { hardwareState: stored.profileData.hardwareState as PrinterProfile['hardwareState'] } : {}),
      ...(stored.profileData.testMetadata ? { testMetadata: stored.profileData.testMetadata as PrinterProfile['testMetadata'] } : {}),
    });
  }

  private resolveDevice(profile: PrinterProfile, jobId: string): PrinterDevice & { profileId: string; jobId: string } {
    if (profile.device.kind === 'network') {
      return { ...profile.device, profileId: profile.id, jobId };
    }
    return { ...profile.device, profileId: profile.id, jobId };
  }

  private render(job: QueuedJob, profile: PrinterProfile): Uint8Array {
    const template = job.templateId
      ? this.templateRepo.find(job.templateId)
      : this.templateRepo.findByType(job.type)[0];
    let definition: TemplateDefinition;
    try {
      if (job.templateId && BUILTIN_TEMPLATES[job.templateId]) {
        definition = TemplateDefinitionSchema.parse(BUILTIN_TEMPLATES[job.templateId]);
      } else if (template) {
        definition = TemplateDefinitionSchema.parse(JSON.parse(template.content));
      } else {
        throw new Error('No template found');
      }
    } catch {
      throw new Error('INVALID_TEMPLATE_DEFINITION');
    }
    const data = (job.payload ?? {}) as Record<string, unknown>;
    const layout = resolveLayout(definition, data, profile);
    return encodeEscPos(layout, profile, {
      cut: job.actions?.cut ?? profile.cut,
      openDrawer: job.actions?.openDrawer ?? profile.drawer,
    });
  }
}
