import { expect, test } from 'bun:test';
import { fiscalGuardrail, reduceTemplate } from './editor-state';
import type { TemplateDefinition } from '@impresora-pos/templates';

const template: TemplateDefinition = { id: 'invoice', name: 'Factura', source: 'local', paperWidth: 80, blocks: [
  { type: 'field', path: 'issuerRuc' }, { type: 'field', path: 'documentNumber' }, { type: 'text', content: 'Cliente' }, { type: 'field', path: 'customer' }, { type: 'items-table', columns: [{ header: 'Producto', path: 'items[].name' }] }, { type: 'totals' }, { type: 'field', path: 'accessKey' }, { type: 'field', path: 'environment' },
] };

test('moving block preserves block identities and order', () => {
  const result = reduceTemplate(template, { type: 'move', from: 4, to: 2 });
  expect(result.blocks[2]?.type).toBe('items-table');
  expect(result.blocks).toHaveLength(template.blocks.length);
});
test('text update changes only selected block', () => {
  const result = reduceTemplate(template, { type: 'update-text', index: 2, patch: { bold: true } });
  expect(result.blocks[2]).toMatchObject({ type: 'text', content: 'Cliente', bold: true });
  expect(result.blocks[0]).toEqual(template.blocks[0]);
});
test('removing required fiscal role makes guardrail invalid', () => {
  const result = reduceTemplate(template, { type: 'remove', index: 6 });
  expect(fiscalGuardrail(result).valid).toBe(false);
  expect(fiscalGuardrail(result).missing).toContain('accessKey');
});
