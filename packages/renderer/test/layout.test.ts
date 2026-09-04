import { describe, expect, test } from 'bun:test';
import { resolveLayout } from '../src/layout';
import { toPreviewModel } from '../src/preview';
import { encodeEscPos } from '../src/escpos';
import { BUILTIN_TEMPLATES } from '@impresora-pos/templates';
import type { PrinterProfile } from '@impresora-pos/printer-core';

const ecuadorInvoice80 = BUILTIN_TEMPLATES['ecuador-invoice-80-v1']!;
const ecuadorInvoice58 = BUILTIN_TEMPLATES['ecuador-invoice-58-v1']!;

const profile80: PrinterProfile = {
  id: 'test-80',
  name: 'Test 80mm',
  transport: 'network',
  device: { kind: 'network', host: 'localhost', port: 9100 },
  language: 'esc-pos',
  paperWidthMm: 80,
  columns: 48,
  codepageMapping: 'epson',
  cut: false,
  drawer: false,
};

const profile58: PrinterProfile = {
  id: 'test-58',
  name: 'Test 58mm',
  transport: 'network',
  device: { kind: 'network', host: 'localhost', port: 9100 },
  language: 'esc-pos',
  paperWidthMm: 58,
  columns: 32,
  codepageMapping: 'epson',
  cut: false,
  drawer: false,
};

const invoiceFixture = {
  issuerRuc: '1234567890001',
  documentNumber: '001-001-000000001',
  customer: 'JUAN PEREZ',
  'customer.identifier': '1798765432001',
  environment: { production: true, test: false },
  documentType: 'invoice',
  date: '2024-01-15',
  time: '10:30:00',
  items: [
    { name: 'Producto corto', quantity: 1, price: '10.00', total: '10.00' },
    { name: 'Descripción muy larga del producto que excede el ancho disponible', quantity: 2, price: '4.25', total: '8.50' },
  ],
  totals: { subtotal: '18.50', tax: '0.00', total: '18.50' },
  accessKey: '1501202401123456789000000010010000000019299999999999',
};

test('diagnostic text keeps bold and double-size in the shared layout', () => {
  const diagnostic = BUILTIN_TEMPLATES['printer-diagnostic-v1']!;
  const layout = resolveLayout(diagnostic, {}, profile80);
  expect(layout.rows.find(row => row.text.includes('NEGRITA'))?.cells[0]?.bold).toBe(true);
  expect(layout.rows.find(row => row.text.includes('DOBLE TAMAÑO'))?.cells[0]?.size).toBe('double');
});

const invoiceFixtureWithAccents = {
  ...invoiceFixture,
  customer: 'José García',
  items: [
    { name: 'Añameños con eñe', quantity: 1, price: '10.00', total: '10.00' },
    { name: 'Piña colada', quantity: 2, price: '4.25', total: '8.50' },
  ],
};

describe('layout resolver', () => {
  test('80mm profile resolves to 48 columns', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.columns).toBe(48);
  });

  test('58mm profile resolves to 32 columns', () => {
    const layout = resolveLayout(ecuadorInvoice58, invoiceFixture, profile58);
    expect(layout.columns).toBe(32);
  });

  test('layout contains accessKey semantic role row', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.some(r => r.semanticRole === 'accessKey')).toBe(true);
  });

  test('layout contains totals semantic role row with correct total', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const totalRow = layout.rows.find(r => r.semanticRole === 'total');
    expect(totalRow?.text).toContain('18.50');
  });

  test('unapproved path produces no rows', () => {
    const templateWithBadPath = {
      id: 'test',
      name: 'Test',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [{ type: 'field' as const, path: 'nonexistent.path' }],
    };
    const layout = resolveLayout(templateWithBadPath as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.every(r => r.text === '' || r.cells.every(c => c.text === ''))).toBe(true);
  });

  test('items-table preserves quantity and total as separate cells', () => {
    const layout = resolveLayout(ecuadorInvoice58, invoiceFixture, profile58);
    const itemRows = layout.rows.filter(r => r.semanticRole === 'item');
    expect(itemRows.length).toBeGreaterThan(0);
    const hasQuantity = itemRows.some(r => r.cells.some(c => c.text === '1' || c.text === '2'));
    const hasTotal = itemRows.some(r => r.cells.some(c => c.text === '10.00' || c.text === '8.50'));
    expect(hasQuantity).toBe(true);
    expect(hasTotal).toBe(true);
  });

  test('items-table quantity and total cells are distinct/separate', () => {
    const layout = resolveLayout(ecuadorInvoice58, invoiceFixture, profile58);
    const itemRows = layout.rows.filter(r => r.semanticRole === 'item');
    for (const row of itemRows) {
      const texts = row.cells.map(c => c.text);
      const quantityIdx = texts.findIndex(t => t === '1' || t === '2');
      const totalIdx = texts.findIndex(t => t === '10.00' || t === '8.50');
      if (quantityIdx !== -1 && totalIdx !== -1) {
        expect(quantityIdx).not.toBe(totalIdx);
      }
    }
  });

  test('wrapping is deterministic based on profile columns', () => {
    const layout1 = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const layout2 = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout1.rows.map(r => r.text)).toEqual(layout2.rows.map(r => r.text));
  });

  test('totals preserves money strings without recalculation', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const totalRow = layout.rows.find(r => r.semanticRole === 'total');
    expect(totalRow?.text).toContain('18.50');
    expect(totalRow?.text).toContain('TOTAL:');
    expect(totalRow?.cells.length).toBeGreaterThan(0);
    const moneyStr = totalRow?.cells[0]?.text ?? '';
    expect(moneyStr.includes('18.50')).toBe(true);
  });

  test('items-table with unapproved column path produces empty rows', () => {
    const templateWithBadColumn = {
      id: 'test',
      name: 'Test',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [{
        type: 'items-table' as const,
        columns: [{ header: 'Art', path: 'items[].nonexistent' }],
        showWhenPresent: 'items',
      }],
    };
    const layout = resolveLayout(templateWithBadColumn as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.every(r => r.text === '' || r.cells.every(c => c.text === ''))).toBe(true);
  });

  test('barcode with unapproved path produces empty rows', () => {
    const templateWithBadBarcode = {
      id: 'test',
      name: 'Test',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [{ type: 'barcode' as const, value: '{nonexistent.path}' }],
    };
    const layout = resolveLayout(templateWithBadBarcode as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.every(r => r.text === '' || r.cells.every(c => c.text === ''))).toBe(true);
  });

  test('qr with unapproved path produces empty rows', () => {
    const templateWithBadQr = {
      id: 'test',
      name: 'Test',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [{ type: 'qr' as const, value: '{invalid.path}' }],
    };
    const layout = resolveLayout(templateWithBadQr as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.every(r => r.text === '' || r.cells.every(c => c.text === ''))).toBe(true);
  });

  test('items-table with unapproved showWhenPresent path produces empty rows', () => {
    const templateWithBadShowWhen = {
      id: 'test',
      name: 'Test',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [{
        type: 'items-table' as const,
        columns: [{ header: 'Art', path: 'items[].name' }],
        showWhenPresent: 'nonexistent',
      }],
    };
    const layout = resolveLayout(templateWithBadShowWhen as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.every(r => r.text === '' || r.cells.every(c => c.text === ''))).toBe(true);
  });
});
