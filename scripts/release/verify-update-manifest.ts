import { readFileSync } from 'node:fs';
import { verifyManifest } from '../../apps/agent/src/update/verify';

const [manifestPath, publicKeyPath] = process.argv.slice(2);
if (!manifestPath || !publicKeyPath) throw new Error('usage: manifest public-key');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
const publicKey = readFileSync(publicKeyPath, 'utf8');
if (!verifyManifest(manifest, publicKey)) throw new Error('UPDATE_MANIFEST_INVALID');
