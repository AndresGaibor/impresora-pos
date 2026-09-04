import { describe, expect, test } from 'bun:test';
import { AgentClient } from './agent-client';
import { withSanitizedIpcErrors } from './ipc-errors';

describe('AgentClient', () => {
  test('uses fixed agent routes and attaches admin bearer only in main', async () => {
    const requests: Request[] = [];
    const client = new AgentClient({
      baseUrl: 'http://127.0.0.1:18181',
      adminToken: 'fake-admin-token',
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify([{
          id: 'p1', name: 'Printer', paperWidthMm: 80, transport: 'network',
          device: { kind: 'network', host: '127.0.0.1', port: 9100 },
          language: 'esc-pos', columns: 48, codepageMapping: 'epson', cut: false, drawer: false,
        }]), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await client.getProfiles();

    expect(requests[0]?.url).toBe('http://127.0.0.1:18181/admin/profiles');
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer fake-admin-token');
  });

  test('rejects non-JSON responses and sanitizes network errors', async () => {
    const client = new AgentClient({
      adminToken: 'secret-token',
      fetch: async () => new Response('secret-token', { status: 502 }),
    });

    await expect(client.getDashboard()).rejects.toMatchObject({
      code: 'AGENT_REQUEST_FAILED',
      message: 'Agent request failed',
    });
    await expect(client.getDashboard()).rejects.not.toHaveProperty('body');
  });

  test('sends the configured admin Origin so dashboard is not rejected as missing origin', async () => {
    const requests: Request[] = [];
    const client = new AgentClient({
      adminToken: 'fake-admin-token',
      adminOrigin: 'app://impresora-pos',
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (!request.headers.get('origin')) return new Response(JSON.stringify({ code: 'MISSING_ORIGIN' }), { status: 403, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ status: 'ok', agentVersion: '1', apiVersion: '1', templateSchemaVersion: '1', agent: 'online', profile: null, recentJobs: [], capabilities: { supportedTransports: ['system'], supportedLanguages: ['esc-pos'], supportedPaperWidths: [80] } }), { headers: { 'content-type': 'application/json' } });
      },
    });

    await expect(client.getDashboard()).resolves.toMatchObject({ status: 'ok' });
    expect(requests[0]?.headers.get('origin')).toBe('app://impresora-pos');
  });

  test('does not accept renderer-controlled URL, method, token, or raw bytes', () => {
    expect(AgentClient).not.toHaveProperty('request');
    expect(AgentClient).not.toHaveProperty('fetch');
  });

  test('sanitizes validation and transport errors at the IPC boundary', async () => {
    const internal = new Error('ZodError: path=secret, Authorization=Bearer fake-admin-token');
    await expect(withSanitizedIpcErrors(() => { throw internal; })).rejects.toMatchObject({
      code: 'IPC_REQUEST_FAILED',
      message: 'Request failed',
    });
    await expect(withSanitizedIpcErrors(() => { throw internal; })).rejects.not.toHaveProperty('issues');
  });
});
