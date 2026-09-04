import { describe, test, expect } from 'bun:test';
import { createLogger, REDACTED } from '../src/logging/logger';

describe('Logger - sensitive data leakage prevention', () => {

  const logger = createLogger();

  test('info redacts nested token values', () => {
    const output = logger.info('job.start', {
      jobId: 'job-123',
      token: 'super-secret-token',
      nested: { token: 'nested-secret' },
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('nested-secret');
    expect(output.metadata).toHaveProperty('jobId', 'job-123');
  });

  test('info redacts authorization headers', () => {
    const output = logger.info('job.start', {
      jobId: 'job-456',
      authorization: 'Bearer secret-auth',
      headers: { authorization: 'Bearer header-secret' },
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('secret-auth');
    expect(serialized).not.toContain('header-secret');
    expect(output.metadata).toHaveProperty('jobId', 'job-456');
  });

  test('info redacts customer fields', () => {
    const output = logger.info('job.start', {
      jobId: 'job-789',
      customer: { name: 'John Doe', ssn: '123-45-6789' },
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('John Doe');
    expect(serialized).not.toContain('123-45-6789');
    expect(output.metadata).toHaveProperty('jobId', 'job-789');
  });

  test('info redacts identification fields', () => {
    const output = logger.info('job.start', {
      jobId: 'job-ident',
      identification: { id: 'ID123456', passport: 'AB123456' },
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('ID123456');
    expect(serialized).not.toContain('AB123456');
    expect(output.metadata).toHaveProperty('jobId', 'job-ident');
  });

  test('info redacts items and invoice payloads', () => {
    const output = logger.info('job.start', {
      jobId: 'job-items',
      items: [{ sku: 'ITEM-001', price: 100 }],
      data: { invoice: { total: 999 } },
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('ITEM-001');
    expect(serialized).not.toContain('999');
    expect(output.metadata).toHaveProperty('jobId', 'job-items');
  });

  test('info preserves only approved technical fields', () => {
    const output = logger.info('job.end', {
      jobId: 'job-approved',
      type: 'invoice',
      profileId: 'printer-1',
      durationMs: 1500,
      state: 'SENT',
      errorCode: null,
      secretToken: 'should-not-appear',
      payload: { amount: 500 },
    });
    expect(output.metadata).toHaveProperty('jobId', 'job-approved');
    expect(output.metadata).toHaveProperty('type', 'invoice');
    expect(output.metadata).toHaveProperty('profileId', 'printer-1');
    expect(output.metadata).toHaveProperty('durationMs', 1500);
    expect(output.metadata).toHaveProperty('state', 'SENT');
    expect(output.metadata).not.toHaveProperty('secretToken');
    expect(output.metadata).not.toHaveProperty('payload');
  });

  test('error preserves only approved technical fields', () => {
    const output = logger.error('job.failed', {
      jobId: 'job-error',
      type: 'receipt',
      profileId: 'printer-2',
      durationMs: 500,
      state: 'FAILED',
      errorCode: 'print_timeout',
      token: 'secret',
      customer: { name: 'Jane' },
    });
    expect(output.metadata).toHaveProperty('jobId', 'job-error');
    expect(output.metadata).toHaveProperty('type', 'receipt');
    expect(output.metadata).toHaveProperty('profileId', 'printer-2');
    expect(output.metadata).toHaveProperty('durationMs', 500);
    expect(output.metadata).toHaveProperty('state', 'FAILED');
    expect(output.metadata).toHaveProperty('errorCode', 'print_timeout');
    expect(output.metadata).not.toHaveProperty('token');
    expect(output.metadata).not.toHaveProperty('customer');
  });

  test('error does not include stack trace by default', () => {
    const output = logger.error('job.crash', {
      jobId: 'job-stack',
      errorCode: 'ERR_TEST',
      stack: 'Error: boom\n  at line 1',
    });
    expect(output.metadata).not.toHaveProperty('stack');
    expect(output.metadata).toHaveProperty('jobId', 'job-stack');
    expect(output.metadata).toHaveProperty('errorCode', 'ERR_TEST');
  });

  test('REDACTED constant is exported', () => {
    expect(REDACTED).toBe('[REDACTED]');
  });

  test('whitelist keys appear in output', () => {
    const output = logger.info('test', {
      jobId: 'j1',
      type: 't1',
      profileId: 'p1',
      durationMs: 100,
      state: 'OK',
      errorCode: null,
    });
    expect(output.metadata).toHaveProperty('jobId', 'j1');
    expect(output.metadata).toHaveProperty('type', 't1');
    expect(output.metadata).toHaveProperty('profileId', 'p1');
    expect(output.metadata).toHaveProperty('durationMs', 100);
    expect(output.metadata).toHaveProperty('state', 'OK');
    expect(output.metadata).toHaveProperty('errorCode', null);
  });

  test('info rejects object injection on jobId', () => {
    const output = logger.info('job.start', {
      jobId: { token: 'super-secret' } as unknown as string,
    });
    expect(output.metadata).not.toHaveProperty('jobId');
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('super-secret');
  });

  test('info rejects object injection on type', () => {
    const output = logger.info('job.start', {
      jobId: 'job-type-obj',
      type: { nested: 'invoice-data' } as unknown as string,
    });
    expect(output.metadata).not.toHaveProperty('type');
    expect(output.metadata).toHaveProperty('jobId', 'job-type-obj');
  });

  test('info rejects object injection on profileId', () => {
    const output = logger.info('job.start', {
      jobId: 'job-profile-obj',
      profileId: { token: 'printer-secret' } as unknown as string,
    });
    expect(output.metadata).not.toHaveProperty('profileId');
    expect(output.metadata).toHaveProperty('jobId', 'job-profile-obj');
  });

  test('info rejects object injection on durationMs', () => {
    const output = logger.info('job.start', {
      jobId: 'job-duration-obj',
      durationMs: { value: 5000 } as unknown as number,
    });
    expect(output.metadata).not.toHaveProperty('durationMs');
    expect(output.metadata).toHaveProperty('jobId', 'job-duration-obj');
  });

  test('info rejects object injection on state', () => {
    const output = logger.info('job.start', {
      jobId: 'job-state-obj',
      state: { code: 'SENT' } as unknown as string,
    });
    expect(output.metadata).not.toHaveProperty('state');
    expect(output.metadata).toHaveProperty('jobId', 'job-state-obj');
  });

  test('info rejects object injection on errorCode', () => {
    const output = logger.info('job.start', {
      jobId: 'job-errorcode-obj',
      errorCode: { msg: 'ERR_SECRET' } as unknown as string,
    });
    expect(output.metadata).not.toHaveProperty('errorCode');
    expect(output.metadata).toHaveProperty('jobId', 'job-errorcode-obj');
  });

  test('error rejects nested object on jobId with secret', () => {
    const output = logger.error('job.fail', {
      jobId: { token: 'error-token-secret' } as unknown as string,
      errorCode: 'ERR_FAIL',
    });
    expect(output.metadata).not.toHaveProperty('jobId');
    expect(output.metadata).toHaveProperty('errorCode', 'ERR_FAIL');
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('error-token-secret');
  });

  test('info and error produce safe JSON separately', () => {
    const infoOut = logger.info('info.event', { jobId: 'info-job', state: 'OK' });
    const errorOut = logger.error('error.event', { jobId: 'error-job', state: 'FAIL', errorCode: 'ERR' });
    expect(infoOut.event).toBe('info.event');
    expect(errorOut.event).toBe('error.event');
    expect(infoOut.metadata).toHaveProperty('jobId', 'info-job');
    expect(errorOut.metadata).toHaveProperty('jobId', 'error-job');
    expect(errorOut.metadata).toHaveProperty('errorCode', 'ERR');
    const infoJson = JSON.stringify(infoOut);
    const errorJson = JSON.stringify(errorOut);
    expect(infoJson).not.toContain('error-job');
    expect(errorJson).not.toContain('info-job');
  });
});
