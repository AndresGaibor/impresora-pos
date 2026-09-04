import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { canonicalManifest, canApplyUpdate, shouldCheckUpdate, verifyArtifactHash, isNewerVersion } from '../src/update/verify';
import { applyVerifiedInstaller } from '../src/update/installer';

const manifest = { version: '1.2.0', url: 'https://example.test/agent.exe', sha256: 'abc', publishedAt: '2026-09-04T00:00:00.000Z', signature: 'sig' };
test('canonical manifest excludes signature with fixed key order', () => { expect(canonicalManifest(manifest)).toBe('{"version":"1.2.0","url":"https://example.test/agent.exe","sha256":"abc","publishedAt":"2026-09-04T00:00:00.000Z"}'); });
test('automatic update checks are limited to 24 hours', () => { expect(shouldCheckUpdate(1000, 1000 + 23 * 60 * 60 * 1000)).toBe(false); expect(shouldCheckUpdate(1000, 1000 + 24 * 60 * 60 * 1000)).toBe(true); });
test('busy jobs block update application', () => { expect(canApplyUpdate(['QUEUED'])).toBe(false); expect(canApplyUpdate(['SENDING'])).toBe(false); expect(canApplyUpdate(['UNKNOWN', 'SENT'])).toBe(true); });
test('artifact hash verification rejects mismatches', async () => { expect(await verifyArtifactHash(new TextEncoder().encode('ok'), '2689367b205c16ce8c2c4f8a31b5c9f1a0a1f5e6f8d6e1e1b2f3f8e5e6a1b9c0')).toBe(false); });
test('version comparison is numeric and rejects equal or downgrade', () => { expect(isNewerVersion('10.0.0', '2.0.0')).toBe(true); expect(isNewerVersion('2.0.0', '10.0.0')).toBe(false); expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false); });
test('waits for the installer launch callback before resolving', async () => {
  const bytes = new TextEncoder().encode('installer');
  const hash = createHash('sha256').update(bytes).digest('hex');
  let launched = false;
  await applyVerifiedInstaller('unused', hash, async () => {
    await Promise.resolve();
    launched = true;
  }, () => bytes);
  expect(launched).toBe(true);
});
