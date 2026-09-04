import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { verifyArtifactHash } from './verify';

export async function applyVerifiedInstaller(
  path: string,
  expectedHash: string,
  spawnInstaller: (path: string) => void | Promise<void> = defaultSpawn,
  readFile: (path: string) => Uint8Array = readFileSync,
): Promise<void> {
  const bytes = readFile(path);
  if (!await verifyArtifactHash(bytes, expectedHash)) throw new Error('UPDATE_HASH_MISMATCH');
  await spawnInstaller(path);
}

function defaultSpawn(path: string): void {
  const child = spawn(path, [], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}
