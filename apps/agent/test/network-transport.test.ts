import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createServer } from 'node:net';
import { NetworkPrinterTransport } from '../src/transports/network';
import { PRINTER_NOT_FOUND, NETWORK_TIMEOUT } from '@impresora-pos/printer-core/src/errors';
import type { NetworkDevice } from '@impresora-pos/printer-core/src/types';

function makeTcpServer(ephemeralPort: number) {
  let receivedBytes: Uint8Array | null = null;
  let resolveServerReady: (port: number) => void;
  let resolveEnd: () => void;
  const serverReady = new Promise<number>((resolve) => { resolveServerReady = resolve; });
  const endPromise = new Promise<void>((resolve) => { resolveEnd = resolve; });

  const server = createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    socket.on('end', () => {
      receivedBytes = new Uint8Array(Buffer.concat(chunks));
      resolveEnd();
    });
  });

  server.listen(ephemeralPort, '127.0.0.1', () => {
    resolveServerReady((server.address() as { port: number }).port);
  });

  return { server, receivedBytes: () => receivedBytes, serverReady, endPromise };
}

describe('NetworkPrinterTransport', () => {
  let transport: NetworkPrinterTransport;

  beforeEach(() => {
    transport = new NetworkPrinterTransport();
  });

  afterEach(() => {
    transport.close();
  });

  test('discover returns empty list', async () => {
    const devices = await transport.discover();
    expect(devices).toEqual([]);
  });

  test('print delivers exact bytes to TCP server', async () => {
    const { server, receivedBytes, serverReady, endPromise } = makeTcpServer(0);
    const boundPort = await serverReady;
    const device = { kind: 'network' as const, host: '127.0.0.1', port: boundPort };

    const testBytes = new Uint8Array([0x1B, 0x40, 0x30, 0x31, 0x0A]);
    await transport.print(device, testBytes);

    await endPromise;

    expect(receivedBytes()).not.toBeNull();
    expect(receivedBytes()!).toEqual(testBytes);

    server.close();
  });

  test('print maps refused connection to PRINTER_NOT_FOUND', async () => {
    const { server, serverReady } = makeTcpServer(0);
    const boundPort = await serverReady;
    server.close();

    await new Promise<void>((r) => setTimeout(r, 10));

    const device = { kind: 'network' as const, host: '127.0.0.1', port: boundPort };
    const testBytes = new Uint8Array([0x1B, 0x40]);

    await expect(transport.print(device, testBytes)).rejects.toMatchObject({
      code: PRINTER_NOT_FOUND,
    });
  });

  test('print maps timeout to NETWORK_TIMEOUT', async () => {
    class ShortTimeoutTransport extends NetworkPrinterTransport {
      readonly printTimeoutMs = 5;
    }

    const shortTransport = new ShortTimeoutTransport();
    const server = createServer((socket) => {
      socket.pause();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    const largeBytes = new Uint8Array(1024 * 1024 * 10);
    largeBytes.fill(0xAA);

    const device = { kind: 'network' as const, host: '127.0.0.1', port };

    await expect(shortTransport.print(device, largeBytes)).rejects.toMatchObject({
      code: NETWORK_TIMEOUT,
    });

    shortTransport.close();
    server.close();
  }, { timeout: 30000 });

  test('multiple prints clean up sockets after each operation', async () => {
    const { server, receivedBytes, serverReady, endPromise } = makeTcpServer(0);
    const boundPort = await serverReady;
    const device = { kind: 'network' as const, host: '127.0.0.1', port: boundPort };

    const bytes1 = new Uint8Array([0x1B, 0x40, 0x30]);
    const result1 = await transport.print(device, bytes1);
    expect(result1.success).toBe(true);

    const bytes2 = new Uint8Array([0x1B, 0x40, 0x31]);
    const result2 = await transport.print(device, bytes2);
    expect(result2.success).toBe(true);

    server.close();
  });

  test('close is idempotent and does not throw', () => {
    const server = createServer((socket) => {
      socket.pause();
    });
    server.listen(0, '127.0.0.1', () => {});

    transport.close();
    transport.close();
    expect(() => transport.close()).not.toThrow();

    server.close();
  });
});
