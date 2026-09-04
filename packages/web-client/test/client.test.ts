import { expect, test } from 'bun:test';
import { ImpresoraPosClient } from '../src';
import { memoryTokenStore } from '../src/storage';

test('uses fixed localhost endpoint and sends strict declarative print after health preflight', async () => {
  const requests: Request[] = []; const client = new ImpresoraPosClient({ origin: 'https://erp.example', tokenStore: { ...memoryTokenStore(), get: () => 'token' }, fetch: async (input, init) => { requests.push(new Request(input, init)); return new Response(JSON.stringify({ status: 'ok', agentVersion: '1', apiVersion: 1, templateSchemaVersion: 1 })); } });
  await client.print({ schemaVersion: 1, jobId: 'erp-1', type: 'receipt', data: { title: 'Venta', lines: [{ description: 'A', amount: '1.00' }] } } as never);
  expect(requests[0]?.url).toBe('http://127.0.0.1:18181/v1/health'); expect(requests[1]?.url).toBe('http://127.0.0.1:18181/v1/print'); expect(await requests[1]?.json()).toMatchObject({ jobId: 'erp-1', type: 'receipt' });
});
