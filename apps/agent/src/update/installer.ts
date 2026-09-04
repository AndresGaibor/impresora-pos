import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { verifyArtifactHash } from './verify';

export async function applyVerifiedInstaller(path: string, expectedHash: string, spawnInstaller: (path: string) => void = defaultSpawn): Promise<void> {
  const bytes = readFileSync(path);
  if (!await verifyArtifactHash(bytes, expectedHash)) throw new Error('UPDATE_HASH_MISMATCH');
  spawnInstaller(path);
}

function defaultSpawn(path: string): void {
  const child = spawn(path, [], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}
