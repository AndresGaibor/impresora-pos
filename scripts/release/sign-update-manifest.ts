import { readFileSync, writeFileSync } from 'node:fs';
import { sign, createPrivateKey } from 'node:crypto';
import { UpdateManifestSchema } from '../../apps/agent/src/update/schema';
import { canonicalManifest } from '../../apps/agent/src/update/verify';
const [input, keyPath, output] = process.argv.slice(2);
if (!input || !keyPath || !output) throw new Error('usage: unsigned-manifest private-key output');
const unsigned = JSON.parse(readFileSync(input, 'utf8'));
const signature = sign(null, Buffer.from(canonicalManifest({ ...unsigned, signature: 'placeholder' })), createPrivateKey(readFileSync(keyPath)),).toString('base64url');
writeFileSync(output, JSON.stringify(UpdateManifestSchema.parse({ ...unsigned, signature })) + '\n');
