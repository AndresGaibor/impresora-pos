import { Router } from '../router';
import { extractAuth, verifyAuth } from '../auth';
import { hashToken } from '../pairing';
import { RateLimiter } from '../rate-limit';
import { PairingMetadataRepository } from '../../db/repositories/pairings';
import { JobService } from '../../jobs/job-service';
import { JobAlreadyExistsError } from '../../db/repositories/jobs';
import { PrintJobSchema } from '@impresora-pos/contracts';

const MAX_BODY_SIZE = 1024 * 1024;
function errorResponse(code: string, message: string, requestId: string, status: number): Response {
  return new Response(JSON.stringify({ code, message, requestId }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createPrintRouter(
  approvedOrigins: string[],
  pairingRepo: PairingMetadataRepository,
  jobService: JobService,
  rateLimiter: RateLimiter,
): Router {
  const router = new Router();

  router.add({
    method: 'POST',
    path: '/v1/print',
    auth: true,
    handler: async (req: Request): Promise<Response> => {
      const ctx = extractAuth(req);
      const requestId = crypto.randomUUID();

      if (!ctx.origin || !approvedOrigins.includes(ctx.origin)) {
        const originKey = `auth:127.0.0.1:${ctx.origin}`;
        const authAllowed = rateLimiter.checkAuth(originKey).allowed;
        if (!authAllowed) return errorResponse('RATE_LIMITED', 'Too many requests', requestId, 429);
        return errorResponse(
          ctx.origin ? 'FORBIDDEN_ORIGIN' : 'MISSING_ORIGIN',
          'Origin not allowed',
          requestId,
          403,
        );
      }

      const contentLength = parseInt(req.headers.get('Content-Length') ?? '0', 10);
      if (contentLength > MAX_BODY_SIZE) {
        return errorResponse('BODY_TOO_LARGE', 'Request body too large', requestId, 413);
      }

      let body: unknown;
      try {
        const bytes = await req.arrayBuffer();
        if (bytes.byteLength > MAX_BODY_SIZE) {
          return errorResponse('BODY_TOO_LARGE', 'Request body too large', requestId, 413);
        }
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return errorResponse('INVALID_JSON', 'Invalid JSON body', requestId, 400);
      }

      if (!ctx.token) {
        const allowed = rateLimiter.checkAuth(`auth:127.0.0.1:${ctx.origin}`).allowed;
        if (!allowed) return errorResponse('RATE_LIMITED', 'Too many requests', requestId, 429);
        return errorResponse('MISSING_TOKEN', 'Authorization required', requestId, 401);
      }

      const stored = pairingRepo.findByTokenHash(hashToken(ctx.token));
      const auth = verifyAuth(ctx, approvedOrigins, stored?.tokenHash ?? null, stored?.origin ?? null);
      if (!auth.valid) {
        const authAllowed = rateLimiter.checkAuth(`auth:127.0.0.1:${ctx.origin}`).allowed;
        if (!authAllowed) return errorResponse('RATE_LIMITED', 'Too many requests', requestId, 429);
        return errorResponse(auth.code ?? 'INVALID_TOKEN', 'Authentication failed', requestId, auth.code === 'FORBIDDEN_ORIGIN' ? 403 : 401);
      }

      const validation = PrintJobSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.message, requestId, 422);
      }

      const job = validation.data;
      const printAllowed = rateLimiter.checkPrint(`print:127.0.0.1:${ctx.origin}`).allowed;
      if (!printAllowed) return errorResponse('RATE_LIMITED', 'Too many requests', requestId, 429);

      try {
        let isDuplicate = false;
        const existingStatus = await jobService.getStatus(job.jobId);
        if (existingStatus !== null) {
          isDuplicate = true;
        }

        let status;
        try {
          status = await jobService.submit({
            jobId: job.jobId,
            type: job.type,
            profileId: job.printerProfileId ?? 'p1',
            payload: job.data,
            reprintOf: job.reprintOf ?? null,
          });
        } catch (err) {
          if (err instanceof JobAlreadyExistsError) {
            status = await jobService.getStatus(job.jobId);
            isDuplicate = true;
          } else {
            throw err;
          }
        }

        const httpStatus = isDuplicate ? 200 : 202;
        return new Response(JSON.stringify({ jobId: status!.jobId, state: status!.state, requestId }), {
          status: httpStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        void err;
        return errorResponse('PRINT_ERROR', 'Print request failed', requestId, 500);
      }
    },
  });

  router.add({
    method: 'GET',
    path: '/v1/jobs/:jobId',
    auth: true,
    handler: async (req: Request, params: Record<string, string>): Promise<Response> => {
      const ctx = extractAuth(req);
      const requestId = crypto.randomUUID();

      if (!ctx.origin || !approvedOrigins.includes(ctx.origin)) {
        return errorResponse(
          ctx.origin ? 'FORBIDDEN_ORIGIN' : 'MISSING_ORIGIN',
          'Origin not allowed',
          requestId,
          403,
        );
      }

      if (!ctx.token) {
        return errorResponse('MISSING_TOKEN', 'Authorization required', requestId, 401);
      }

       const stored = pairingRepo.findByTokenHash(hashToken(ctx.token));
       const auth = verifyAuth(ctx, approvedOrigins, stored?.tokenHash ?? null, stored?.origin ?? null);
       if (!auth.valid) return errorResponse(auth.code ?? 'INVALID_TOKEN', 'Authentication failed', requestId, auth.code === 'FORBIDDEN_ORIGIN' ? 403 : 401);

      const jobId = params['jobId']!;
      const status = await jobService.getStatus(jobId);
      if (!status) {
        return errorResponse('NOT_FOUND', 'Job not found', requestId, 404);
      }
      return new Response(JSON.stringify({ jobId: status.jobId, state: status.state, errorCode: status.errorCode, requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  return router;
}
