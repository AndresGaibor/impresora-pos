import { verifyTokenHash } from './pairing';
import { timingSafeEqual } from 'crypto';

export interface AuthContext {
  origin: string;
  token: string | null;
}

export function extractAuth(req: Request): AuthContext {
  const origin = req.headers.get('Origin') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  let token: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  return { origin, token };
}

export function verifyAuth(
  ctx: AuthContext,
  approvedOrigins: string[],
  tokenHash: string | null,
  tokenOrigin: string | null = null,
): { valid: boolean; code?: string } {
  if (!ctx.origin || !approvedOrigins.includes(ctx.origin)) {
    return { valid: false, code: ctx.origin ? 'FORBIDDEN_ORIGIN' : 'MISSING_ORIGIN' };
  }
  if (!ctx.token) {
    return { valid: false, code: 'MISSING_TOKEN' };
  }
  if (!tokenHash) {
    return { valid: false, code: 'INVALID_TOKEN' };
  }
  if (!verifyTokenHash(ctx.token, tokenHash)) {
    return { valid: false, code: 'INVALID_TOKEN' };
  }
  if (tokenOrigin !== null) {
    const expected = Buffer.from(tokenOrigin);
    const actual = Buffer.from(ctx.origin);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { valid: false, code: 'FORBIDDEN_ORIGIN' };
    }
  }
  return { valid: true };
}
