export type QueuedJob = {
  jobId: string;
  type: string;
  profileId: string;
  templateId?: string;
  payload: unknown;
  actions?: { cut?: boolean; openDrawer?: boolean };
  reprintOf: string | null;
};

export class PerProfileQueue {
  private queues = new Map<string, QueuedJob[]>();
  private active = new Map<string, boolean>();

  enqueue(profileId: string, job: QueuedJob): void {
    if (!this.queues.has(profileId)) {
      this.queues.set(profileId, []);
    }
    this.queues.get(profileId)!.push(job);
  }

  dequeue(profileId: string): QueuedJob | undefined {
    return this.queues.get(profileId)?.shift();
  }

  peek(profileId: string): QueuedJob | undefined {
    return this.queues.get(profileId)?.[0];
  }

  isActive(profileId: string): boolean {
    return this.active.get(profileId) ?? false;
  }

  setActive(profileId: string, active: boolean): void {
    this.active.set(profileId, active);
  }

  size(profileId: string): number {
    return this.queues.get(profileId)?.length ?? 0;
  }
}
