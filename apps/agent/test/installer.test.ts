import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { applyVerifiedInstaller } from '../src/update/installer';

test('installer verifies staged bytes immediately before spawn', async () => { const dir = mkdtempSync(join(tmpdir(), 'impresora-update-')); const path = join(dir, 'setup.exe'); const bytes = Buffer.from('verified-installer'); writeFileSync(path, bytes); const hash = createHash('sha256').update(bytes).digest('hex'); let spawned = ''; await applyVerifiedInstaller(path, hash, value => { spawned = value; }); expect(spawned).toBe(path); });
test('installer refuses mismatched staged bytes', async () => { const dir = mkdtempSync(join(tmpdir(), 'impresora-update-')); const path = join(dir, 'setup.exe'); writeFileSync(path, 'tampered'); await expect(applyVerifiedInstaller(path, '0'.repeat(64), () => { throw new Error('must not spawn'); })).rejects.toThrow('UPDATE_HASH_MISMATCH'); });
