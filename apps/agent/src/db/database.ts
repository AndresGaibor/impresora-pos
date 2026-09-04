import { Database } from 'bun:sqlite';
import { migrate } from './migrations';
import { JobMetadataRepository } from './repositories/jobs';
import { PairingMetadataRepository } from './repositories/pairings';
import { PrinterProfileRepository } from './repositories/profiles';
import { TemplateRepository } from './repositories/templates';

export { migrate, SCHEMA_VERSION } from './migrations';
export { JobMetadataRepository, JobAlreadyExistsError } from './repositories/jobs';
export type { JobMetadata, JobState } from './repositories/jobs';
export { PairingMetadataRepository } from './repositories/pairings';
export type { PairingMetadata } from './repositories/pairings';
export { PrinterProfileRepository } from './repositories/profiles';
export type { PrinterProfile } from './repositories/profiles';
export { TemplateRepository } from './repositories/templates';
export type { Template } from './repositories/templates';

export function openDatabase(path: string): Database {
  return new Database(path);
}
