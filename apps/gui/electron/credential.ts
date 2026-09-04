import { readFileSync } from 'node:fs';

export function readAdminCredential(path: string): string {
  const value = readFileSync(path, 'utf8').trim();
  if (!value || value.length > 512 || /\s/.test(value)) throw new Error('ADMIN_CREDENTIAL_INVALID');
  return value;
}
