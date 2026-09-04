import { describe, expect, test } from 'bun:test';
import { PrinterProfileSchema } from '../src/profile';

describe('PrinterProfile', () => {
  test('valid network profile with 80mm paper', () => {
    const result = PrinterProfileSchema.parse({
      id: 'cashier-1',
      name: 'Caja 1',
      transport: 'network',
      device: { kind: 'network', host: '192.168.1.50', port: 9100 },
      language: 'esc-pos',
      paperWidthMm: 80,
      columns: 48,
      codepageMapping: 'epson',
      cut: true,
      drawer: false,
      defaultTemplates: { invoice: 'ecuador-invoice-80-v1' },
    });
    expect(result.columns).toBe(48);
    expect(result.paperWidthMm).toBe(80);
  });

  test('valid network profile with 58mm paper', () => {
    const result = PrinterProfileSchema.parse({
      id: 'kitchen-1',
      name: 'Cocina',
      transport: 'network',
      device: { kind: 'network', host: '192.168.1.51', port: 9100 },
      language: 'esc-pos',
      paperWidthMm: 58,
      columns: 32,
      codepageMapping: 'epson',
      cut: false,
      drawer: false,
    });
    expect(result.paperWidthMm).toBe(58);
    expect(result.columns).toBe(32);
  });

  test('valid system profile', () => {
    const result = PrinterProfileSchema.parse({
      id: 'local-1',
      name: 'Impresora Local',
      transport: 'system',
      device: { kind: 'system', deviceName: 'EPSON-TM-T88' },
      language: 'epson',
      paperWidthMm: 80,
      columns: 48,
      codepageMapping: 'epson',
      cut: true,
      drawer: true,
    });
    expect(result.transport).toBe('system');
    expect(result.device.kind).toBe('system');
  });

  test('rejects network transport with a system device', () => {
    expect(() => PrinterProfileSchema.parse({
      id: 'mismatch-network', name: 'Mismatch', transport: 'network',
      device: { kind: 'system', deviceName: 'Local' }, language: 'esc-pos', paperWidthMm: 80,
      columns: 48, codepageMapping: 'epson', cut: false, drawer: false,
    })).toThrow();
  });

  test('rejects system transport with a network device', () => {
    expect(() => PrinterProfileSchema.parse({
      id: 'mismatch-system', name: 'Mismatch', transport: 'system',
      device: { kind: 'network', host: '127.0.0.1', port: 9100 }, language: 'esc-pos', paperWidthMm: 80,
      columns: 48, codepageMapping: 'epson', cut: false, drawer: false,
    })).toThrow();
  });

  test('rejects profile with paperWidthMm 57', () => {
    expect(() => PrinterProfileSchema.parse({ paperWidthMm: 57 })).toThrow();
  });

  test('rejects profile with paperWidthMm 40', () => {
    expect(() => PrinterProfileSchema.parse({ paperWidthMm: 40 })).toThrow();
  });
});
