import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalManifest } from '../../apps/agent/src/update/verify';
const [artifact, version, url, publishedAt, output] = process.argv.slice(2);
if (!artifact || !version || !url || !publishedAt || !output) throw new Error('usage: artifact version url publishedAt output');
const manifest = { version, url, sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'), publishedAt, signature: '' };
writeFileSync(output, `${canonicalManifest(manifest)}\n`);
