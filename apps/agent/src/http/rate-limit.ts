interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_PAIRING_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 5 };
const DEFAULT_PRINT_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 };
const DEFAULT_AUTH_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 20 };

export class RateLimiter {
  private pairingLimits = new Map<string, RateLimitEntry>();
  private printLimits = new Map<string, RateLimitEntry>();
  private authLimits = new Map<string, RateLimitEntry>();

  constructor(
    private pairingLimit: RateLimitConfig = DEFAULT_PAIRING_LIMIT,
    private printLimit: RateLimitConfig = DEFAULT_PRINT_LIMIT,
    private authLimit: RateLimitConfig = DEFAULT_AUTH_LIMIT,
  ) {}

  checkPairing(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    return this.check(key, 'pairing');
  }

  checkPrint(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    return this.check(key, 'print');
  }

  checkAuth(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    return this.check(key, 'auth');
  }

  private check(key: string, type: 'pairing' | 'print' | 'auth'): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let limits: Map<string, RateLimitEntry>;
    let config: RateLimitConfig;

    if (type === 'pairing') {
      limits = this.pairingLimits;
      config = this.pairingLimit;
    } else if (type === 'print') {
      limits = this.printLimits;
      config = this.printLimit;
    } else {
      limits = this.authLimits;
      config = this.authLimit;
    }

    let entry = limits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs };
    }

    entry.count++;
    limits.set(key, entry);

    const allowed = entry.count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    return { allowed, remaining, resetAt: entry.resetAt };
  }
}
