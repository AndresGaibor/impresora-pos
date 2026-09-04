import { PairingMetadataRepository } from '../db/repositories/pairings';
import { createHash, timingSafeEqual } from 'crypto';

const PAIRING_TTL_MS = 5 * 60 * 1000;

interface PendingPairing {
  expiresAt: number;
  origin: string;
}

export class PairingService {
  private pendingCodes = new Map<string, PendingPairing>();

  constructor(
    private pairingRepo: PairingMetadataRepository,
  ) {}

  registerPairingCode(code: string, origin: string): void {
    this.pendingCodes.set(code, { expiresAt: Date.now() + PAIRING_TTL_MS, origin });
    setTimeout(() => this.pendingCodes.delete(code), PAIRING_TTL_MS);
  }

  async createToken(code: string, origin: string): Promise<{ token: string; isNew: boolean } | null> {
    const pending = this.pendingCodes.get(code);
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
      this.pendingCodes.delete(code);
      return null;
    }
    if (pending.origin !== origin) return null;

    // Reserve synchronously before generating or persisting the bearer token.
    this.pendingCodes.delete(code);

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Buffer.from(tokenBytes).toString('base64url');
    const tokenHash = `sha256:${createHash('sha256').update(token).digest('hex')}`;

    const existing = this.pairingRepo.findByTokenHash(tokenHash);
    if (existing) {
      return { token, isNew: false };
    }

    this.pairingRepo.approve({ token, origin });
    return { token, isNew: true };
  }

  verifyToken(token: string, origin: string): boolean {
    const tokenHash = `sha256:${createHash('sha256').update(token).digest('hex')}`;
    const stored = this.pairingRepo.findByTokenHash(tokenHash);
    if (!stored) return false;
    const storedOrigin = Buffer.from(stored.origin);
    const requestedOrigin = Buffer.from(origin);
    if (storedOrigin.length !== requestedOrigin.length || !timingSafeEqual(storedOrigin, requestedOrigin)) return false;
    return true;
  }
}

export function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

export function verifyTokenHash(token: string, tokenHash: string): boolean {
  const computed = hashToken(token);
  if (computed.length !== tokenHash.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(tokenHash));
}
