import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { UpdateManifestSchema, type UpdateManifest } from './schema';
export function canonicalManifest(manifest: UpdateManifest): string { return JSON.stringify({ version: manifest.version, url: manifest.url, sha256: manifest.sha256, publishedAt: manifest.publishedAt }); }
export function verifyManifest(manifest: unknown, publicKeyPem: string): boolean { try { const value = UpdateManifestSchema.parse(manifest); return verifySignature(null, Buffer.from(canonicalManifest(value)), createPublicKey(publicKeyPem), Buffer.from(value.signature, 'base64url')); } catch { return false; } }
export async function verifyArtifactHash(bytes: Uint8Array, expected: string): Promise<boolean> { return createHash('sha256').update(bytes).digest('hex') === expected.toLowerCase(); }
export function shouldCheckUpdate(lastCheckAt: number | null, now: number): boolean { return lastCheckAt === null || now - lastCheckAt >= 24 * 60 * 60 * 1000; }
export function canApplyUpdate(states: string[]): boolean { return !states.some(state => state === 'QUEUED' || state === 'SENDING'); }
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => value.replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const next = parse(candidate); const installed = parse(current);
  for (let index = 0; index < 3; index += 1) { if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0); }
  return false;
}
