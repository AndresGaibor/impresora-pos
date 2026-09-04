import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SystemNativeApi } from './system';

type HelperRequest = { cmd: 'list' } | { cmd: 'probe'; devicePath: string } | { cmd: 'print'; devicePath: string; data: string };
type HelperListResponse = { ok: true; printers: { name: string; isDefault: boolean; devicePath?: string }[] };
type HelperProbeResponse = { ok: true; reachable: boolean; firmwareVersion?: string; serialNumber?: string };
type HelperPrintResponse = { ok: true; success: boolean; spoolerId?: string };
type HelperErrorResponse = { ok: false; error: string; code: string };
type HelperResponse = HelperListResponse | HelperProbeResponse | HelperPrintResponse | HelperErrorResponse;

export function resolveHelperPath(): string {
  const candidates = [
    process.env.IMPRESORA_POS_HELPER_PATH,
    join(dirname(process.execPath), 'helper.exe'),
    join(import.meta.dir, '../../../../native/windows-print-helper/out/helper.exe'),
  ].filter((path): path is string => Boolean(path));
  const path = candidates.find(candidate => existsSync(candidate));
  return path ?? candidates[0]!;
}

async function helperCommand(req: HelperRequest): Promise<HelperResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveHelperPath(), [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code: number | null) => {
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        const debugInfo = stderr.trim().slice(0, 200);
        reject(Object.assign(new Error(debugInfo || `helper exited ${code}`), { code: 'HELPER_ERROR' }));
        return;
      }

      try {
        const resp = JSON.parse(trimmed) as HelperResponse;
        resolve(resp);
      } catch {
        const debugInfo = stderr.trim().slice(0, 200);
        reject(Object.assign(new Error(debugInfo || 'helper produced invalid JSON'), { code: 'HELPER_INVALID_JSON' }));
      }
    });

    child.on('error', (err: Error) => {
      reject(Object.assign(new Error(err.message), { code: 'HELPER_NOT_FOUND' }));
    });

    child.stdin!.write(JSON.stringify(req));
    child.stdin!.end();
  });
}

export function createSystemNativeApi(): SystemNativeApi {
  return {
    async list() {
      const resp = await helperCommand({ cmd: 'list' }) as HelperListResponse | HelperErrorResponse;
      if (!resp.ok) {
        throw Object.assign(new Error(resp.error), { code: resp.code });
      }
      return resp.printers;
    },
    async probe(devicePath: string) {
      const resp = await helperCommand({ cmd: 'probe', devicePath }) as HelperProbeResponse | HelperErrorResponse;
      if (!resp.ok) {
        throw Object.assign(new Error(resp.error), { code: resp.code });
      }
      return {
        reachable: resp.reachable,
        ...(resp.firmwareVersion !== undefined ? { firmwareVersion: resp.firmwareVersion } : {}),
        ...(resp.serialNumber !== undefined ? { serialNumber: resp.serialNumber } : {}),
      };
    },
    async print(devicePath: string, base64: string) {
      const resp = await helperCommand({ cmd: 'print', devicePath, data: base64 }) as HelperPrintResponse | HelperErrorResponse;
      if (!resp.ok) {
        throw Object.assign(new Error(resp.error), { code: resp.code });
      }
      return { success: resp.success, ...(resp.spoolerId !== undefined ? { spoolerId: resp.spoolerId } : {}) };
    },
  };
}
