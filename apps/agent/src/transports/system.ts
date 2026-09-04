import type { PrinterDevice, SystemDevice, ProbeResult, SendResult, PrinterTransport } from '@impresora-pos/printer-core/src/types';
import { PRINTER_NOT_FOUND, SPOOLER_REJECTED, HELPER_NOT_FOUND, HELPER_INVALID_JSON, HELPER_ERROR, HELPER_INVALID_DATA } from '@impresora-pos/printer-core/src/errors';

const HELPER_ERROR_CODES = new Set([HELPER_NOT_FOUND, HELPER_INVALID_JSON, HELPER_ERROR, HELPER_INVALID_DATA]);

export type SystemNativeApi = {
  list(): Promise<{ name: string; isDefault: boolean; devicePath?: string }[]>;
  probe(devicePath: string): Promise<{ reachable: boolean; firmwareVersion?: string; serialNumber?: string }>;
  print(devicePath: string, base64: string): Promise<{ success: boolean; spoolerId?: string }>;
};

export class SystemPrinterTransport implements PrinterTransport {
  readonly ready = true;
  readonly capabilities = { languages: ['esc-pos'], paperWidths: [58, 80] };
  constructor(private readonly native: SystemNativeApi) {}

  async discover(): Promise<PrinterDevice[]> {
    const printers = await this.native.list();
    return printers.map((p) => ({
      kind: 'system' as const,
      deviceName: p.name,
      ...(p.devicePath !== undefined ? { devicePath: p.devicePath } : {}),
    }));
  }

  async probe(device: PrinterDevice): Promise<ProbeResult> {
    if (device.kind !== 'system') {
      return { device, reachable: false };
    }
    const sd = device as SystemDevice;
    const devicePath = sd.devicePath ?? '';
    const result = await this.native.probe(devicePath);
    return {
      device,
      reachable: result.reachable,
      ...(result.firmwareVersion !== undefined ? { firmwareVersion: result.firmwareVersion } : {}),
      ...(result.serialNumber !== undefined ? { serialNumber: result.serialNumber } : {}),
    };
  }

  async print(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult> {
    if (device.kind !== 'system') {
      return { success: false, bytesSent: 0 };
    }
    const sd = device as SystemDevice;
    const devicePath = sd.devicePath ?? '';
    const base64 = Buffer.from(bytes).toString('base64');

    try {
      const result = await this.native.print(devicePath, base64);
      return {
        success: result.success,
        bytesSent: bytes.length,
        ...(result.spoolerId !== undefined ? { spoolerId: result.spoolerId } : {}),
      };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === SPOOLER_REJECTED) {
        throw Object.assign(new Error('Spooler rejected job'), { code: SPOOLER_REJECTED });
      }
      if (e.code === PRINTER_NOT_FOUND) {
        throw Object.assign(new Error('Printer not found'), { code: PRINTER_NOT_FOUND });
      }
      if (e.code && HELPER_ERROR_CODES.has(e.code as typeof HELPER_ERROR)) {
        const msg = (err as Error).message || 'Helper error';
        throw Object.assign(new Error(msg), { code: e.code });
      }
      throw Object.assign(new Error('Print failed'), { code: HELPER_ERROR });
    }
  }
}
