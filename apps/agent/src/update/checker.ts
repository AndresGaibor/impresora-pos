import type { UpdateManifest } from './schema';
import { isNewerVersion, shouldCheckUpdate, verifyManifest } from './verify';
export function shouldOfferUpdate(currentVersion: string, manifest: UpdateManifest, publicKey: string, lastCheckAt: number | null, now: number): boolean { return shouldCheckUpdate(lastCheckAt, now) && verifyManifest(manifest, publicKey) && isNewerVersion(manifest.version, currentVersion); }
