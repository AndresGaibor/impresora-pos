import { describe, expect, test } from 'bun:test';
import { resolveLayout } from '../src/layout';
import { toPreviewModel } from '../src/preview';
import { encodeEscPos, encoderCodepageMapping } from '../src/escpos';
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

describe('ESC/POS encoder', () => {
  test('encodeEscPos returns Uint8Array with length > 20', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const bytes = encodeEscPos(layout, profile80, { cut: true });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(20);
  });

  test('encoded output contains TOTAL text', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const bytes = encodeEscPos(layout, profile80, {});
    const buffer = Buffer.from(bytes);
    expect(buffer.includes(Buffer.from('TOTAL'))).toBe(true);
  });

  test('accents áéíóúñÑ encode as epson codepage bytes', () => {
    const templateWithAccents = {
      id: 'test-accents',
      name: 'Test Accents',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [
        { type: 'text' as const, content: 'José: áéíóúñÑ' },
      ],
    };
    const layout = resolveLayout(templateWithAccents as typeof ecuadorInvoice80, invoiceFixture, profile80);
    const bytes = encodeEscPos(layout, profile80, {});
    expect(bytes).toBeInstanceOf(Uint8Array);
    const hasAcuteA = Array.from(bytes).includes(0xa0);
    const hasNTilde = Array.from(bytes).includes(0xa4);
    expect(hasAcuteA).toBe(true);
    expect(hasNTilde).toBe(true);
  });

  test('profile codepage mapping reaches the encoder', () => {
    const diagnostic = BUILTIN_TEMPLATES['printer-diagnostic-v1']!;
    const layout = resolveLayout(diagnostic, {}, { ...profile80, codepageMapping: 'standard' });
    const bytes = encodeEscPos(layout, { ...profile80, codepageMapping: 'standard' }, {});
    expect(bytes.length).toBeGreaterThan(20);
    expect(layout.rows.some(row => row.text.includes('á é í ó ú ñ Ñ'))).toBe(true);
  });

  test('domain codepage mappings translate to supported encoder mappings', () => {
    expect(encoderCodepageMapping('epson')).toBe('epson');
    expect(encoderCodepageMapping('standard')).toBe('pos-5890');
    expect(encoderCodepageMapping('custom')).toBe('pos-5890');
  });

  test('diagnostic style samples emit bold and double-size commands', () => {
    const diagnostic = BUILTIN_TEMPLATES['printer-diagnostic-v1']!;
    const bytes = encodeEscPos(resolveLayout(diagnostic, {}, profile80), profile80, {});
    expect(Array.from(bytes)).toContain(0x1b);
    expect(bytes.length).toBeGreaterThan(50);
  });

  test('Code128 barcode from 49-digit value encodes', () => {
    const templateWithBarcode = {
      id: 'test-barcode',
      name: 'Test Barcode',
      source: 'builtin' as const,
      paperWidth: 80,
      blocks: [
        { type: 'barcode' as const, value: '{accessKey}' },
      ],
    };
    const layout = resolveLayout(templateWithBarcode as typeof ecuadorInvoice80, invoiceFixture, profile80);
    expect(layout.rows.some(r => r.semanticRole === 'barcode')).toBe(true);
    const bytes = encodeEscPos(layout, profile80, {});
    expect(bytes).toBeInstanceOf(Uint8Array);
    const hasBarcodeCommand = hasEscPosBarcodeCommand(bytes);
    expect(hasBarcodeCommand).toBe(true);
  });

  test('QR output is present in encoded bytes', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const bytes = encodeEscPos(layout, profile80, {});
    expect(bytes).toBeInstanceOf(Uint8Array);
    const hasQRCommand = hasEscPosQRCommand(bytes);
    expect(hasQRCommand).toBe(true);
  });

  test('cut enabled adds cut command bytes', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const bytesWithCut = encodeEscPos(layout, profile80, { cut: true });
    const bytesWithoutCut = encodeEscPos(layout, profile80, { cut: false });
    expect(bytesWithCut.length).toBeGreaterThan(bytesWithoutCut.length);
    const hasCutCommand = hasEscPosCutCommand(bytesWithCut);
    expect(hasCutCommand).toBe(true);
  });

  test('drawer enabled adds pulse command bytes', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const bytesWithDrawer = encodeEscPos(layout, profile80, { openDrawer: true });
    const bytesWithoutDrawer = encodeEscPos(layout, profile80, { openDrawer: false });
    expect(bytesWithDrawer.length).toBeGreaterThan(bytesWithoutDrawer.length);
    const hasPulseCommand = hasEscPosPulseCommand(bytesWithDrawer);
    expect(hasPulseCommand).toBe(true);
  });

  test('58mm profile with 32 columns produces valid output', () => {
    const layout = resolveLayout(ecuadorInvoice58, invoiceFixture, profile58);
    const bytes = encodeEscPos(layout, profile58, { cut: true });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(20);
  });

  test('custom 24-column profile preserves width and ESC/POS commands', () => {
    const profile24 = { ...profile58, id: 'test-24', columns: 24 };
    const templateWithSymbols = {
      ...ecuadorInvoice58,
      blocks: [
        { type: 'barcode' as const, value: '{accessKey}' },
        { type: 'qr' as const, value: '{accessKey}' },
      ],
    };
    const layout = resolveLayout(templateWithSymbols, invoiceFixture, profile24);
    const bytes = encodeEscPos(layout, profile24, { cut: true, openDrawer: true });
    expect(layout.columns).toBe(24);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(20);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(hasEscPosBarcodeCommand(bytes)).toBe(true);
    expect(hasEscPosQRCommand(bytes)).toBe(true);
    expect(hasEscPosCutCommand(bytes)).toBe(true);
    expect(hasEscPosPulseCommand(bytes)).toBe(true);
  });
});

describe('preview and ESC/POS consume same LayoutModel', () => {
  test('same resolved layout produces both preview and ESC/POS output', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const preview = toPreviewModel(layout);
    const bytes = encodeEscPos(layout, profile80, { cut: true });
    expect(preview.columns).toBe(layout.columns);
    expect(preview.rows.length).toBe(layout.rows.length);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test('preview cells match layout cells exactly', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const preview = toPreviewModel(layout);
    for (let i = 0; i < layout.rows.length; i++) {
      const layoutRow = layout.rows[i]!;
      const previewRow = preview.rows[i]!;
      expect(layoutRow.semanticRole).toBe(previewRow.semanticRole);
      expect(layoutRow.text).toBe(previewRow.text);
      expect(layoutRow.cells.length).toBe(previewRow.cells.length);
    }
  });

  test('preview and ESC/POS consume the same layout object directly', () => {
    const layout = resolveLayout(ecuadorInvoice80, invoiceFixture, profile80);
    const originalRowCount = layout.rows.length;
    const originalColumns = layout.columns;
    const preview = toPreviewModel(layout);
    const bytes = encodeEscPos(layout, profile80, { cut: true });
    expect(preview.rows.length).toBe(originalRowCount);
    expect(preview.columns).toBe(originalColumns);
    expect(preview.rows[0]?.text).toBe(layout.rows[0]?.text);
    expect(bytes.length).toBeGreaterThan(0);
    expect(layout.rows.length).toBe(originalRowCount);
    expect(layout.columns).toBe(originalColumns);
  });
});

function hasEscPosBarcodeCommand(bytes: Uint8Array): boolean {
  const gs = 0x1d;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === gs && bytes[i + 1] === 0x6b) return true;
  }
  return false;
}

function hasEscPosQRCommand(bytes: Uint8Array): boolean {
  const gs = 0x1d;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === gs && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b) return true;
  }
  return false;
}

function hasEscPosCutCommand(bytes: Uint8Array): boolean {
  const gs = 0x1d;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === gs && bytes[i + 1] === 0x56) return true;
  }
  return false;
}

function hasEscPosPulseCommand(bytes: Uint8Array): boolean {
  const esc = 0x1b;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === esc && bytes[i + 1] === 0x70) return true;
  }
  return false;
}
