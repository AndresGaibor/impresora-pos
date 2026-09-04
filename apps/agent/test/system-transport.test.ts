import { describe, test, expect } from 'bun:test';
import type { SystemDevice } from '@impresora-pos/printer-core/src/types';
import { PRINTER_NOT_FOUND, SPOOLER_REJECTED, HELPER_NOT_FOUND, HELPER_INVALID_JSON, HELPER_ERROR, HELPER_INVALID_DATA } from '@impresora-pos/printer-core/src/errors';

type NativeListResult = { name: string; isDefault: boolean; devicePath?: string };

type NativePrinterApi = {
  list(): Promise<NativeListResult[]>;
  probe(devicePath: string): Promise<{ reachable: boolean; firmwareVersion?: string; serialNumber?: string }>;
  print(devicePath: string, base64: string): Promise<{ success: boolean; spoolerId?: string }>;
};

interface LastRawJob {
  devicePath: string;
  base64: string;
  bytes: Uint8Array;
}

function fakeNativePrinterApi(printers: NativeListResult[] = []): NativePrinterApi & {
  printers: NativeListResult[];
  lastRawJob: LastRawJob | undefined;
  listCallCount: number;
  probeCallCount: number;
  printCallCount: number;
  rejectCode: string | undefined;
  unknownPrinter: boolean;
} {
  return {
    printers: [...printers],
    lastRawJob: undefined,
    listCallCount: 0,
    probeCallCount: 0,
    printCallCount: 0,
    rejectCode: undefined,
    unknownPrinter: false,
    async list() {
      this.listCallCount++;
      return this.printers;
    },
    async probe(devicePath: string) {
      this.probeCallCount++;
      const found = this.printers.some(p => p.devicePath === devicePath || (!devicePath && p.isDefault));
      return { reachable: found || !this.unknownPrinter };
    },
    async print(devicePath: string, base64: string) {
      this.printCallCount++;
      if (this.rejectCode) {
        const err = new Error(this.rejectCode) as Error & { code: string };
        err.code = this.rejectCode;
        throw err;
      }
      if (this.unknownPrinter && devicePath) {
        const err = new Error('printer not found') as Error & { code: string };
        err.code = PRINTER_NOT_FOUND;
        throw err;
      }
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      this.lastRawJob = { devicePath: devicePath || (this.printers.find(p => p.isDefault)?.devicePath ?? ''), base64, bytes };
      return { success: true, spoolerId: `spool-${Date.now()}` };
    },
  };
}

import { SystemPrinterTransport } from '../src/transports/system';

describe('SystemPrinterTransport', () => {
  test('discover returns installed printers mapped to PrinterDevice records', async () => {
    const native = fakeNativePrinterApi([
      { name: 'EPSON TM-T20III', isDefault: true },
      { name: 'Zebra ZP-450', isDefault: false, devicePath: 'ZEBRA001' },
    ]);
    const transport = new SystemPrinterTransport(native);

    const devices = await transport.discover();

    expect(devices).toHaveLength(2);
     expect(devices[0]!.kind).toBe('system');
    expect((devices[0] as SystemDevice).deviceName).toBe('EPSON TM-T20III');
     expect(devices[1]!.kind).toBe('system');
    expect((devices[1] as SystemDevice).devicePath).toBe('ZEBRA001');
  });

  test('print delivers RAW bytes to native boundary as base64', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true }]);
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', deviceName: 'EPSON TM-T20III' };

    const testBytes = new Uint8Array([0x1b, 0x40, 0x30, 0x31, 0x0a]);
    await transport.print(device, testBytes);

    expect(native.lastRawJob).toBeDefined();
    expect(native.lastRawJob!.bytes).toEqual(testBytes);
    expect(native.lastRawJob!.base64).toBe(btoa(String.fromCharCode(...testBytes)));
  });

  test('print with devicePath from discover resolves correctly', async () => {
    const native = fakeNativePrinterApi([
      { name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' },
    ]);
    const transport = new SystemPrinterTransport(native);
    const devices = await transport.discover();
    const device = devices[0] as SystemDevice;

    await transport.print(device, new Uint8Array([0x1b, 0x40]));

    expect(native.lastRawJob!.devicePath).toBe('EPSON001');
  });

  test('probe returns reachable for discovered printer', async () => {
    const native = fakeNativePrinterApi([
      { name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' },
    ]);
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    const result = await transport.probe(device);

    expect(result.reachable).toBe(true);
    expect(result.device.kind).toBe('system');
  });

  test('probe returns not reachable for unknown printer', async () => {
    const native = fakeNativePrinterApi([]);
    native.unknownPrinter = true;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'UNKNOWN' };

    const result = await transport.probe(device);

    expect(result.reachable).toBe(false);
  });

  test('native rejection maps to SPOOLER_REJECTED', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.rejectCode = SPOOLER_REJECTED;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: SPOOLER_REJECTED,
    });
  });

  test('unknown printer print maps to PRINTER_NOT_FOUND', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.unknownPrinter = true;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'NONEXISTENT' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: PRINTER_NOT_FOUND,
    });
  });

  test('HELPER_NOT_FOUND is preserved and not mapped to PRINTER_NOT_FOUND', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.rejectCode = HELPER_NOT_FOUND;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: HELPER_NOT_FOUND,
    });
  });

  test('HELPER_INVALID_JSON is preserved and not mapped to PRINTER_NOT_FOUND', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.rejectCode = HELPER_INVALID_JSON;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: HELPER_INVALID_JSON,
    });
  });

  test('HELPER_ERROR is preserved and not mapped to PRINTER_NOT_FOUND', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.rejectCode = HELPER_ERROR;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: HELPER_ERROR,
    });
  });

  test('HELPER_INVALID_DATA is preserved and not mapped to PRINTER_NOT_FOUND', async () => {
    const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true, devicePath: 'EPSON001' }]);
    native.rejectCode = HELPER_INVALID_DATA;
    const transport = new SystemPrinterTransport(native);
    const device: SystemDevice = { kind: 'system', devicePath: 'EPSON001' };

    await expect(transport.print(device, new Uint8Array([0x1b, 0x40]))).rejects.toMatchObject({
      code: HELPER_INVALID_DATA,
    });
  });

  test('discover makes exactly one list call per invocation', async () => {
    const native = fakeNativePrinterApi([
      { name: 'HP LaserJet', isDefault: false, devicePath: 'HP001' },
    ]);
    const transport = new SystemPrinterTransport(native);

    await transport.discover();
    expect(native.listCallCount).toBe(1);

    await transport.discover();
    expect(native.listCallCount).toBe(2);
  });
});
