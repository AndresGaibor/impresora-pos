import { createServer, createConnection, type Socket } from 'node:net';
import type { PrinterDevice, NetworkDevice, ProbeResult, SendResult } from '@impresora-pos/printer-core/src/types';
import { PRINTER_NOT_FOUND, NETWORK_TIMEOUT } from '@impresora-pos/printer-core/src/errors';

const PROBE_TIMEOUT_MS = 3000;
const DEFAULT_PRINT_TIMEOUT_MS = 10000;

export class NetworkPrinterTransport {
  readonly ready = true;
  readonly capabilities = { languages: ['esc-pos'], paperWidths: [58, 80] };
  protected readonly printTimeoutMs: number = DEFAULT_PRINT_TIMEOUT_MS;
  private activeSockets: Socket[] = [];

  private releaseSocket(s: Socket) {
    const idx = this.activeSockets.indexOf(s);
    if (idx !== -1) this.activeSockets.splice(idx, 1);
  }

  close() {
    const sockets = this.activeSockets.slice();
    this.activeSockets = [];
    for (const s of sockets) {
      s.destroy();
    }
  }

  async discover(): Promise<PrinterDevice[]> {
    return [];
  }

  async probe(device: PrinterDevice): Promise<ProbeResult> {
    if (device.kind !== 'network') {
      return { device, reachable: false };
    }
    const nd = device as NetworkDevice;
    return new Promise((resolve) => {
      const socket = createConnection(
        { host: nd.host, port: nd.port, timeout: PROBE_TIMEOUT_MS },
        () => {
          this.releaseSocket(socket);
          socket.end();
          resolve({ device, reachable: true });
        },
      );
      this.activeSockets.push(socket);
      socket.on('timeout', () => {
        this.releaseSocket(socket);
        socket.destroy();
        resolve({ device, reachable: false });
      });
      socket.on('error', () => {
        this.releaseSocket(socket);
        socket.destroy();
        resolve({ device, reachable: false });
      });
    });
  }

  async print(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult> {
    if (device.kind !== 'network') {
      return { success: false, bytesSent: 0 };
    }
    const nd = device as NetworkDevice;
    const timeoutMs = this.printTimeoutMs;

    return new Promise((resolve, reject) => {
      let rejected = false;
      const socket = createConnection({ host: nd.host, port: nd.port });

      this.activeSockets.push(socket);

      const cleanup = () => {
        const idx = this.activeSockets.indexOf(socket);
        if (idx !== -1) this.activeSockets.splice(idx, 1);
      };

      const tryReject = (err: Error) => {
        if (!rejected) {
          rejected = true;
          cleanup();
          socket.destroy();
          reject(err);
        }
      };

      const tryResolve = (result: SendResult) => {
        if (!rejected) {
          rejected = true;
          cleanup();
          socket.destroy();
          resolve(result);
        }
      };

      const deadline = setTimeout(() => {
        tryReject(Object.assign(new Error('Connection timed out'), { code: NETWORK_TIMEOUT }));
      }, timeoutMs);

      socket.on('timeout', () => {
        clearTimeout(deadline);
        tryReject(Object.assign(new Error('Connection timed out'), { code: NETWORK_TIMEOUT }));
      });

      socket.on('error', (err) => {
        clearTimeout(deadline);
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ECONNREFUSED') {
          tryReject(Object.assign(new Error('Connection refused'), { code: PRINTER_NOT_FOUND }));
        } else {
          tryReject(Object.assign(new Error(e.message || 'Network error'), { code: NETWORK_TIMEOUT }));
        }
      });

      if (socket.readyState === 'open') {
        doWrite();
      } else {
        socket.on('connect', doWrite);
      }

      function doWrite() {
        socket.setTimeout(timeoutMs);
        socket.write(bytes, (err) => {
          if (err) {
            clearTimeout(deadline);
            const code = (err as NodeJS.ErrnoException).code === 'ECONNREFUSED'
              ? PRINTER_NOT_FOUND
              : NETWORK_TIMEOUT;
            tryReject(Object.assign(new Error(err.message), { code }));
            return;
          }
          socket.end(() => {
            clearTimeout(deadline);
            tryResolve({ success: true, bytesSent: bytes.length });
          });
        });
      }
    });
  }
}
