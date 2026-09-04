import { expect, test } from 'bun:test';
import { PrintJobSchema } from '../src/print-job';

const validJob = { schemaVersion: 1, jobId: 'job-001', type: 'receipt', data: { title: 'Prueba', lines: [] } };

test('accepts a declarative print job', () => {
  expect(PrintJobSchema.parse(validJob).jobId).toBe('job-001');
});

test('rejects unknown schema versions and raw payloads', () => {
  expect(() => PrintJobSchema.parse({ ...validJob, schemaVersion: 2 })).toThrow();
  expect(() => PrintJobSchema.parse({ ...validJob, rawEscPos: [27, 64] })).toThrow();
});
