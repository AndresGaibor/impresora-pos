import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentLauncher } from './agent-launcher';

function response(status: string): Response {
  return new Response(JSON.stringify({ status }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function writeLock(path: string, metadata: object): void {
  mkdirSync(path);
  writeFileSync(join(path, 'owner.json'), JSON.stringify(metadata));
}

describe('agent launcher', () => {
  test('healthy agent is reused without spawning', async () => {
    let spawns = 0;
    const launcher = createAgentLauncher({
      fetch: async () => response('ok'),
      spawn: () => { spawns += 1; throw new Error('unexpected spawn'); },
    });

    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: false });
    expect(spawns).toBe(0);
  });

  test('unavailable agent is spawned once and awaited until healthy', async () => {
    let healthChecks = 0;
    let spawns = 0;
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        healthChecks += 1;
        if (healthChecks < 3) throw new Error('connection refused');
        return response('ok');
      },
      spawn: () => { spawns += 1; return { unref() {} } as never; },
      retries: 3,
      retryDelayMs: 0,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: true });
    expect(spawns).toBe(1);
  });

  test('missing executable returns actionable diagnostic', async () => {
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const launcher = createAgentLauncher({
      fetch: async () => { throw new Error('connection refused'); },
      executablePath: '/missing/impresora-pos-agent',
      exists: () => false,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'AGENT_NOT_INSTALLED' });
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('wrong process on agent port is not replaced or retried', async () => {
    let spawns = 0;
    const launcher = createAgentLauncher({
      fetch: async () => new Response('not the agent', { status: 200, headers: { 'content-type': 'text/plain' } }),
      spawn: () => { spawns += 1; throw new Error('unexpected spawn'); },
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'PORT_IN_USE' });
    expect(spawns).toBe(0);
  });

  test('concurrent calls share one launch', async () => {
    let spawns = 0;
    let healthy = false;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        if (!healthy) throw new Error('connection refused');
        return response('ok');
      },
      spawn: () => { spawns += 1; healthy = true; return { unref() {} } as never; },
      retries: 2,
      retryDelayMs: 0,
      lockPath,
    });

    const result = await Promise.all([launcher.ensureAgentRunning(), launcher.ensureAgentRunning()]);
    expect(result.every(value => value.available)).toBe(true);
    expect(spawns).toBe(1);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('clears a failed launch so a later health check can recover', async () => {
    let healthy = false;
    let spawns = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        if (!healthy) throw new Error('agent stopped');
        return response('ok');
      },
      spawn: () => { spawns += 1; return { unref() {} } as never; },
      retries: 1,
      retryDelayMs: 0,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'AGENT_UNAVAILABLE' });
    healthy = true;
    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: false });
    expect(spawns).toBe(1);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('recovers a stale lock left by a dead process', async () => {
    let healthy = false;
    let spawns = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    writeLock(lockPath, { pid: 99999, timestamp: Date.now(), token: 'dead-owner' });
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        if (!healthy) throw new Error('connection refused');
        return response('ok');
      },
      isProcessAlive: () => false,
      spawn: () => { spawns += 1; healthy = true; return { unref() {} } as never; },
      retries: 1,
      retryDelayMs: 0,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: true });
    expect(spawns).toBe(1);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('rechecks health after acquiring lock before spawning', async () => {
    let checks = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        checks += 1;
        if (checks === 1) throw new Error('connection refused');
        return response('ok');
      },
      spawn: () => { throw new Error('must reuse agent found by lock recheck'); },
      retries: 1,
      retryDelayMs: 0,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: false });
    expect(checks).toBe(2);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('does not expire a lock whose owner is alive during slow startup', async () => {
    let spawns = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    writeLock(lockPath, { pid: 4242, timestamp: 0, token: 'slow-owner' });
    const launcher = createAgentLauncher({
      fetch: async () => { throw new Error('agent is still starting'); },
      isProcessAlive: pid => pid === 4242,
      spawn: () => { spawns += 1; throw new Error('must not double spawn'); },
      retries: 2,
      retryDelayMs: 0,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'LOCK_TIMEOUT' });
    expect(spawns).toBe(0);
    expect(existsSync(lockPath)).toBe(true);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('two launcher instances atomically recheck and spawn only once', async () => {
    let healthy = false;
    let spawns = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const options = {
      exists: () => true,
      fetch: async () => {
        if (!healthy) throw new Error('connection refused');
        return response('ok');
      },
      spawn: () => { spawns += 1; healthy = true; return { unref() {} } as never; },
      isProcessAlive: (pid: number) => pid === 1001 || pid === 1002,
      retries: 2,
      retryDelayMs: 0,
      lockPath,
    };
    const first = createAgentLauncher({ ...options, processId: 1001 });
    const second = createAgentLauncher({ ...options, processId: 1002 });

    const result = await Promise.all([first.ensureAgentRunning(), second.ensureAgentRunning()]);
    expect(result.every(value => value.available)).toBe(true);
    expect(spawns).toBe(1);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('does not delete a lock replaced during stale takeover', async () => {
    let spawns = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const newLock = JSON.stringify({ pid: 1002, timestamp: Date.now(), token: 'new-owner' });
    writeLock(lockPath, { pid: 1001, timestamp: 0, token: 'old-owner' });
    const launcher = createAgentLauncher({
      fetch: async () => { throw new Error('connection refused'); },
      isProcessAlive: pid => pid === 1002,
      renameLock: (source, destination) => {
        renameSync(source, destination);
        writeLock(lockPath, JSON.parse(newLock));
      },
      spawn: () => { spawns += 1; throw new Error('must not delete or replace new owner'); },
      retries: 1,
      retryDelayMs: 0,
      lockPath,
      processId: 1003,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'LOCK_TIMEOUT' });
    expect(spawns).toBe(0);
    expect(readFileSync(join(lockPath, 'owner.json'), 'utf8')).toBe(newLock);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('bounds stale takeover attempts and returns LOCK_TIMEOUT', async () => {
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    writeLock(lockPath, { pid: 9001, timestamp: 0, token: 'dead-owner' });
    const launcher = createAgentLauncher({
      fetch: async () => { throw new Error('connection refused'); },
      isProcessAlive: () => false,
      renameLock: () => { throw new Error('takeover race'); },
      retries: 1,
      retryDelayMs: 0,
      maxAttempts: 2,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'LOCK_TIMEOUT' });
    expect(existsSync(lockPath)).toBe(true);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('aborts a hanging health request and preserves lock after detached spawn', async () => {
    let spawns = 0;
    let aborted = false;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async (_input, init) => new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      }),
      spawn: () => { spawns += 1; return { unref() {} } as never; },
      retries: 1,
      retryDelayMs: 0,
      healthTimeoutMs: 1,
      lockPath,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toMatchObject({ available: false, code: 'AGENT_UNAVAILABLE' });
    expect(aborted).toBe(true);
    expect(spawns).toBe(1);
    expect(existsSync(lockPath)).toBe(true);
    rmSync(lockPath, { recursive: true, force: true });
  });

  test('does not remove a lock whose owner token changed before cleanup', async () => {
    let checks = 0;
    const lockPath = join(tmpdir(), `impresora-pos-agent-test-${crypto.randomUUID()}.lock`);
    const replacement = { pid: 7002, timestamp: Date.now(), token: 'replacement-owner' };
    const launcher = createAgentLauncher({
      exists: () => true,
      fetch: async () => {
        checks += 1;
        if (checks === 1) throw new Error('connection refused');
        writeFileSync(join(lockPath, 'owner.json'), JSON.stringify(replacement));
        return response('ok');
      },
      lockPath,
      processId: 7001,
    });

    await expect(launcher.ensureAgentRunning()).resolves.toEqual({ available: true, started: false });
    expect(readFileSync(join(lockPath, 'owner.json'), 'utf8')).toBe(JSON.stringify(replacement));
    rmSync(lockPath, { recursive: true, force: true });
  });
});
