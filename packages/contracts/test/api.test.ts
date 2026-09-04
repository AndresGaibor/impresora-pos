import { expect, test } from 'bun:test';
import { CapabilitiesResponseSchema, HealthResponseSchema } from '../src/api';
import { InvoicePrintDataSchema } from '../src/print-job';
import { API_VERSION, TEMPLATE_SCHEMA_VERSION } from '../src/versions';

test('health response uses exact version constants and rejects extra keys', () => {
  expect(
    HealthResponseSchema.parse({
      status: 'ok',
      agentVersion: '1.0.0',
      apiVersion: API_VERSION,
      templateSchemaVersion: TEMPLATE_SCHEMA_VERSION,
    }).apiVersion,
  ).toBe(API_VERSION);

  expect(() => HealthResponseSchema.parse({
    status: 'ok',
    agentVersion: '1.0.0',
    apiVersion: API_VERSION + 1,
    templateSchemaVersion: TEMPLATE_SCHEMA_VERSION,
  })).toThrow();

  expect(() => HealthResponseSchema.parse({
    status: 'ok',
    agentVersion: '1.0.0',
    apiVersion: API_VERSION,
    templateSchemaVersion: TEMPLATE_SCHEMA_VERSION,
    extra: true,
  })).toThrow();
});

test('capabilities response is strict', () => {
  expect(() => CapabilitiesResponseSchema.parse({
    supportedTransports: ['usb'],
    supportedLanguages: ['esc-pos'],
    supportedPaperWidths: [80],
    extra: true,
  })).toThrow();
});

test('public data DTOs are strict', () => {
  expect(() => InvoicePrintDataSchema.parse({
    title: 'Factura',
    invoiceNumber: 'INV-1',
    date: '2026-09-03',
    customerName: 'Cliente',
    lines: [],
    subtotal: '0.00',
    tax: '0.00',
    total: '0.00',
    extra: true,
  })).toThrow();
});
