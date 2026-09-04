import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';

const AGENT_HOST = '127.0.0.1';
const AGENT_PORT = 18181;
const HEALTH_URL = `http://${AGENT_HOST}:${AGENT_PORT}/v1/health`;

export type AgentAvailability =
  | { available: true; started: boolean }
  | { available: false; code: 'AGENT_NOT_INSTALLED' | 'PORT_IN_USE' | 'AGENT_UNAVAILABLE' | 'LOCK_TIMEOUT'; diagnostic: string };

export interface AgentLauncherOptions {
  fetch?: typeof globalThis.fetch;
  executablePath?: string;
  resourcesPath?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  spawn?: (file: string, args: string[], options: { detached: boolean; stdio: 'ignore'; windowsHide: boolean; env: NodeJS.ProcessEnv }) => ChildProcess;
  retries?: number;
  retryDelayMs?: number;
  lockPath?: string;
  processId?: number;
  now?: () => number;
  isProcessAlive?: (pid: number) => boolean;
  readLock?: (path: string) => string;
  renameLock?: (source: string, destination: string) => void;
  maxAttempts?: number;
  healthTimeoutMs?: number;
}

function resolveExecutablePath(options: AgentLauncherOptions): string | undefined {
  const envPath = options.env?.IMPRESORA_POS_AGENT_PATH ?? process.env.IMPRESORA_POS_AGENT_PATH;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? process.cwd();
  const candidates = [
    options.executablePath,
    envPath,
    join(resourcesPath, 'impresora-pos-agent.exe'),
    join(resourcesPath, 'impresora-pos-agent'),
    join(process.cwd(), 'dist', 'windows', 'impresora-pos-agent.exe'),
  ].filter((path): path is string => Boolean(path));
  const isPresent = options.exists ?? existsSync;
  return candidates.find(isPresent);
}

async function probe(fetcher: typeof globalThis.fetch, timeoutMs: number): Promise<'healthy' | 'unavailable' | 'occupied'> {
  const controller = new AbortController();
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let response: Response;
  try {
    abortTimer = setTimeout(() => controller.abort(), timeoutMs);
    const timeout = new Promise<Response>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('health timeout')), timeoutMs);
    });
    response = await Promise.race([
      fetcher(HEALTH_URL, { method: 'GET', signal: controller.signal }),
      timeout,
    ]);
  } catch {
    return 'unavailable';
  } finally {
    if (abortTimer !== undefined) clearTimeout(abortTimer);
    if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
  }
  if (!response.ok) return 'occupied';
  try {
    const body = await response.json() as { status?: unknown };
    return body.status === 'ok' ? 'healthy' : 'occupied';
  } catch {
    return 'occupied';
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForHealthy(fetcher: typeof globalThis.fetch, retries: number, retryDelayMs: number, healthTimeoutMs: number): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await probe(fetcher, healthTimeoutMs) === 'healthy') return true;
    if (attempt < retries - 1) await wait(retryDelayMs);
  }
  return false;
}

export function createAgentLauncher(options: AgentLauncherOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const retries = Math.max(1, options.retries ?? 20);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 100);
  const lockPath = options.lockPath
    ?? options.env?.IMPRESORA_POS_AGENT_LOCK_PATH
    ?? process.env.IMPRESORA_POS_AGENT_LOCK_PATH
    ?? join(tmpdir(), 'impresora-pos-agent.lock');
  const processId = options.processId ?? process.pid;
  const now = options.now ?? Date.now;
  const readLock = options.readLock ?? ((path: string) => readFileSync(path, 'utf8'));
  const renameLock = options.renameLock ?? renameSync;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const healthTimeoutMs = Math.max(1, options.healthTimeoutMs ?? 1_000);
  const isProcessAlive = options.isProcessAlive ?? ((pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  });
  let inFlight: Promise<AgentAvailability> | undefined;

  async function launchAndWait(onStarted: () => void): Promise<AgentAvailability> {
    const executablePath = resolveExecutablePath(options);
    if (!executablePath) {
      return { available: false, code: 'AGENT_NOT_INSTALLED', diagnostic: 'No se encontró el ejecutable instalado del agente Bun.' };
    }

    const spawn = options.spawn ?? ((file, args, spawnOptions) => spawnProcess(file, args, spawnOptions));
    try {
      const child = spawn(executablePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...(options.env ?? process.env), PORT: String(AGENT_PORT), HOSTNAME: AGENT_HOST },
      });
      child.unref();
      onStarted();
    } catch {
      return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo iniciar el agente Bun.' };
    }

    if (await waitForHealthy(fetcher, retries, retryDelayMs, healthTimeoutMs)) return { available: true, started: true };
    return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'El agente no respondió al health check dentro del tiempo límite.' };
  }

  function readLockSnapshot(): { raw: string; pid: number; token: string } | undefined {
    try {
      const raw = readLock(join(lockPath, 'owner.json'));
      const lock = JSON.parse(raw) as { pid?: unknown; token?: unknown };
      const pid = typeof lock.pid === 'number' ? lock.pid : 0;
      const token = typeof lock.token === 'string' ? lock.token : '';
      return { raw, pid, token };
    } catch {
      return undefined;
    }
  }

  function lockIsStale(snapshot: { pid: number; token: string } | undefined): boolean {
    return !snapshot?.pid || !snapshot.token || !isProcessAlive(snapshot.pid);
  }

  function removeOwnedLock(token: string): void {
    const owner = readLockSnapshot();
    if (owner?.pid === processId && owner.token === token) rmSync(lockPath, { recursive: true, force: true });
  }

  function takeOverStaleLock(): 'taken' | 'not-taken' | 'failed' {
    const quarantine = `${lockPath}.stale-${randomUUID()}`;
    try {
      renameLock(lockPath, quarantine);
    } catch {
      return 'not-taken';
    }
    try {
      rmSync(quarantine, { recursive: true, force: true });
      return 'taken';
    } catch {
      return 'failed';
    }
  }

  async function startOrReuse(): Promise<AgentAvailability> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const token = randomUUID();
      const temporaryPath = join(lockPath, `owner.${processId}.${token}.tmp`);
      let acquired = false;
      let preserveLock = false;
      try {
        mkdirSync(lockPath, { mode: 0o700 });
        acquired = true;
        const lockRaw = JSON.stringify({ pid: processId, timestamp: now(), token });
        writeFileSync(temporaryPath, lockRaw, { flag: 'wx', mode: 0o600 });
        renameSync(temporaryPath, join(lockPath, 'owner.json'));
      } catch (error) {
        try { rmSync(temporaryPath, { force: true }); } catch { /* best effort cleanup */ }
        if (acquired) {
          try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
          return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo escribir el metadata del lock de inicio.' };
        }
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo crear el lock de inicio del agente.' };
        }
        const snapshot = readLockSnapshot();
        if (snapshot && lockIsStale(snapshot)) {
          const takeover = takeOverStaleLock();
          if (takeover === 'taken') {
            // The next loop reacquires atomically and rechecks health before spawning.
            continue;
          }
          if (takeover === 'failed') {
            return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo eliminar la cuarentena del lock del agente.' };
          }
          if (takeover === 'not-taken') {
            // A concurrent owner keeps the original lock when the takeover fails.
          }
        }
        if (await waitForHealthy(fetcher, retries, retryDelayMs, healthTimeoutMs)) return { available: true, started: false };
        const current = readLockSnapshot();
        if (current && lockIsStale(current) && attempt + 1 < maxAttempts) {
          const takeover = takeOverStaleLock();
          if (takeover === 'taken') {
            continue;
          }
          if (takeover === 'failed') {
            return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo eliminar la cuarentena del lock del agente.' };
          }
        }
        return { available: false, code: 'LOCK_TIMEOUT', diagnostic: 'El lock de inicio del agente no se pudo recuperar dentro del límite.' };
      }

      try {
        if (await probe(fetcher, healthTimeoutMs) === 'healthy') return { available: true, started: false };
        return await launchAndWait(() => { preserveLock = true; });
      } finally {
        if (acquired && !preserveLock) removeOwnedLock(token);
      }
    }
    return { available: false, code: 'AGENT_UNAVAILABLE', diagnostic: 'No se pudo iniciar el agente dentro del límite de intentos.' };
  }

  function ensureAgentRunning(): Promise<AgentAvailability> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const state = await probe(fetcher, healthTimeoutMs);
      if (state === 'healthy') return { available: true, started: false };
      if (state === 'occupied') {
        if (await waitForHealthy(fetcher, retries, retryDelayMs, healthTimeoutMs)) return { available: true, started: false };
        return { available: false, code: 'PORT_IN_USE', diagnostic: `El puerto ${AGENT_PORT} está ocupado por un proceso que no es el agente.` };
      }
      return startOrReuse();
    })();
    const tracked = inFlight.finally(() => {
      if (inFlight === tracked) inFlight = undefined;
    });
    inFlight = tracked;
    return tracked;
  }

  return { ensureAgentRunning };
}

const defaultLauncher = createAgentLauncher();
export const ensureAgentRunning = defaultLauncher.ensureAgentRunning;
