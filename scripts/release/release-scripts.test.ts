import { expect, test } from 'bun:test';
import { canonicalManifest } from '../../apps/agent/src/update/verify';
test('release canonicalization is stable and excludes signature', () => { expect(canonicalManifest({ version: '1', url: 'https://example.test/a', sha256: 'a'.repeat(64), publishedAt: '2026-09-04T00:00:00.000Z', signature: 'secret' })).not.toContain('secret'); });
