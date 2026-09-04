import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrinterWizard, buildProfile, clearTransportSelection, validateNetworkDevice, validateProfileValues } from './PrinterWizard';
import type { PrinterDevice } from '../../app/agent-api';

const systemDevice: PrinterDevice = { kind: 'system', deviceName: 'XP-80C', devicePath: '/dev/usb/lp0' };

test('system wizard displays discovered devices and normalizes the selected device when saving', () => {
  const html = renderToStaticMarkup(<PrinterWizard api={{} as never} initialDevices={[systemDevice, { kind: 'system', deviceName: 'EPSON TM-T20III' }]} />);
  expect(html).toContain('XP-80C');
  expect(html).toContain('EPSON TM-T20III');

  expect(buildProfile(systemDevice, { name: 'XP-80C', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: true, drawer: false })).toEqual({
    id: 'xp-80c', name: 'XP-80C', transport: 'system', device: systemDevice, language: 'esc-pos',
    paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: true, drawer: false,
    defaultTemplates: { receipt: 'simple-receipt-80', invoice: 'invoice-80' },
  });
});

test('network validation rejects invalid hostnames and ports', () => {
  expect(validateNetworkDevice('', 9100)).toBe('Escribe una IP o hostname válido.');
  expect(validateNetworkDevice('printer.local', 0)).toBe('El puerto debe estar entre 1 y 65535.');
  expect(validateNetworkDevice('printer.local', 65536)).toBe('El puerto debe estar entre 1 y 65535.');
  expect(validateNetworkDevice('192.168.1.20', 9100)).toBeNull();
  expect(validateNetworkDevice('-printer.local', 9100)).toBe('Escribe una IP o hostname válido.');
  expect(validateNetworkDevice('printer-.local', 9100)).toBe('Escribe una IP o hostname válido.');
  expect(validateNetworkDevice('printer..local', 9100)).toBe('Escribe una IP o hostname válido.');
  expect(validateNetworkDevice('a'.repeat(64) + '.local', 9100)).toBe('Escribe una IP o hostname válido.');
  expect(validateNetworkDevice('printer.local', 9100.5)).toBe('El puerto debe estar entre 1 y 65535.');
  expect(validateNetworkDevice('999.1.1.1', 9100)).toBe('Escribe una IP o hostname válido.');
});

test('buildProfile rejects an empty name or invalid columns instead of producing an invalid profile', () => {
  expect(() => buildProfile(systemDevice, { name: '  ', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: false, drawer: false })).toThrow('nombre');
  expect(() => buildProfile(systemDevice, { name: '!!!', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: false, drawer: false })).toThrow('id');
  expect(() => buildProfile(systemDevice, { name: 'XP-80C', paperWidthMm: 80, columns: Number.NaN, codepageMapping: 'epson', cut: false, drawer: false })).toThrow('columnas');
});

test('profile values expose the effective save guards', () => {
  expect(validateProfileValues({ name: ' XP-80C ', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: false, drawer: false })).toBeNull();
  expect(validateProfileValues({ name: '', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: false, drawer: false })).toContain('obligatorio');
  expect(validateProfileValues({ name: 'XP-80C', paperWidthMm: 80, columns: Number.NaN, codepageMapping: 'epson', cut: false, drawer: false })).toContain('columnas');
});

test('switching transport clears a previous network selection and probe', () => {
  const networkDevice: PrinterDevice = { kind: 'network', host: 'printer.local', port: 9100 };
  expect(clearTransportSelection('system', networkDevice, { device: networkDevice, reachable: true })).toEqual({ selected: null, probe: null });
});
