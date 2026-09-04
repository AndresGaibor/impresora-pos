import { expect, test } from 'bun:test';
import {
  TemplateDefinitionSchema,
  type TemplateDefinition,
  validateFiscalTemplate,
  BUILTIN_TEMPLATES,
  type TemplateSource,
  printerDiagnosticV1,
} from '../src/schema';

const baseTemplate: TemplateDefinition = {
  id: 'test-template',
  name: 'Test Template',
  source: 'local',
  paperWidth: 80,
  blocks: [],
};

test('rejects executable template content', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'script', code: 'print()' }],
    }),
  ).toThrow();
});

test('rejects unknown block types', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'unknown-block' }],
    }),
  ).toThrow();
});

test('accepts valid text block', () => {
  const result = TemplateDefinitionSchema.parse({
    ...baseTemplate,
    blocks: [{ type: 'text', content: 'Hello World' }],
  });
  expect(result.blocks).toHaveLength(1);
});

test('accepts valid field block', () => {
  const result = TemplateDefinitionSchema.parse({
    ...baseTemplate,
    blocks: [{ type: 'field', path: 'customer.name' }],
  });
  expect(result.blocks).toHaveLength(1);
});

test('source must be builtin | managed | local', () => {
  expect(
    TemplateDefinitionSchema.parse({ ...baseTemplate, source: 'builtin' }),
  ).toBeDefined();
  expect(
    TemplateDefinitionSchema.parse({ ...baseTemplate, source: 'managed' }),
  ).toBeDefined();
  expect(
    TemplateDefinitionSchema.parse({ ...baseTemplate, source: 'local' }),
  ).toBeDefined();
  expect(() =>
    TemplateDefinitionSchema.parse({ ...baseTemplate, source: 'remote' }),
  ).toThrow();
});

test('showWhenPresent only allows known data paths', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'text', content: 'Hi', showWhenPresent: 'customer.name' }],
    }),
  ).not.toThrow();

  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [
        { type: 'text', content: 'Hi', showWhenPresent: 'eval("")' },
      ],
    }),
  ).toThrow();
});

test('items-table allows collection repetition with showWhenPresent', () => {
  const result = TemplateDefinitionSchema.parse({
    ...baseTemplate,
    blocks: [
      {
        type: 'items-table',
        columns: [{ header: 'Item', path: 'item.name' }],
        showWhenPresent: 'items',
      },
    ],
  });
  expect(result.blocks).toHaveLength(1);
});

test('rejects items-table with expression in showWhenPresent', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [
        {
          type: 'items-table',
          columns: [{ header: 'Item', path: 'item.name' }],
          showWhenPresent: 'items.filter(x => x.price > 0)',
        },
      ],
    }),
  ).toThrow();
});

test('builtin templates are exported', () => {
  expect(BUILTIN_TEMPLATES).toBeDefined();
  expect(typeof BUILTIN_TEMPLATES).toBe('object');
});

test('builtin templates include ecuador invoices', () => {
  const templates = Object.values(BUILTIN_TEMPLATES);
  const has80 = templates.some(
    (t) => t.id === 'ecuador-invoice-80-v1' && t.source === 'builtin',
  );
  const has58 = templates.some(
    (t) => t.id === 'ecuador-invoice-58-v1' && t.source === 'builtin',
  );
  expect(has80).toBe(true);
  expect(has58).toBe(true);
});

test('builtin templates include simple receipt', () => {
  const templates = Object.values(BUILTIN_TEMPLATES);
  const hasSimple = templates.some(
    (t) => t.id === 'simple-receipt-v1' && t.source === 'builtin',
  );
  expect(hasSimple).toBe(true);
});

test('builtin diagnostic template contains every calibration sample', () => {
  const contents = printerDiagnosticV1.blocks
    .filter((block): block is { type: 'text'; content: string } => block.type === 'text')
    .map(block => block.content)
    .join('\n');
  expect(contents).toContain('48 columnas');
  expect(contents).toContain('32 columnas');
  expect(contents).toContain('á é í ó ú ñ Ñ');
  expect(contents).toContain('NEGRITA');
  expect(contents).toContain('DOBLE TAMAÑO');
  expect(printerDiagnosticV1.blocks).toContainEqual(expect.objectContaining({ type: 'text', bold: true }));
  expect(printerDiagnosticV1.blocks).toContainEqual(expect.objectContaining({ type: 'text', size: 'double' }));
  expect(printerDiagnosticV1.blocks).toContainEqual(expect.objectContaining({ type: 'barcode', format: 'CODE128' }));
  expect(printerDiagnosticV1.blocks).toContainEqual(expect.objectContaining({ type: 'qr' }));
  expect(printerDiagnosticV1.blocks).toContainEqual(expect.objectContaining({ type: 'cut' }));
});

test('invoice template requires fiscal blocks - full invoice passes', () => {
  const invoice80 = BUILTIN_TEMPLATES['ecuador-invoice-80-v1']!;
  const result = validateFiscalTemplate(invoice80, 'invoice');
  expect(result.missing).toEqual([]);
  expect(result.valid).toBe(true);
});

test('invoice template without accessKey reports missing', () => {
  const incompleteInvoice: TemplateDefinition = {
    id: 'incomplete-invoice',
    name: 'Incomplete Invoice',
    source: 'local',
    paperWidth: 80,
    blocks: [
      { type: 'field', path: 'issuerRuc' },
      { type: 'field', path: 'documentNumber' },
      { type: 'field', path: 'customer' },
      { type: 'field', path: 'totals' },
      { type: 'field', path: 'environment' },
    ],
  };
  const result = validateFiscalTemplate(incompleteInvoice, 'invoice');
  expect(result.missing).toContain('accessKey');
  expect(result.valid).toBe(false);
});

test('reject non-string showWhenPresent', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'text', content: 'Hi', showWhenPresent: 123 as any }],
    }),
  ).toThrow();
});

test('rejects blocks with HTML content', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'text', content: '<script>alert(1)</script>' }],
    }),
  ).toThrow();
});

test('accepts text with parentheses like Factura (copia)', () => {
  const result = TemplateDefinitionSchema.parse({
    ...baseTemplate,
    blocks: [{ type: 'text', content: 'Factura (copia)' }],
  });
  expect(result.blocks).toHaveLength(1);
  expect((result.blocks[0] as { content: string }).content).toBe('Factura (copia)');
});

test('rejects text with dangerous patterns like eval()', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'text', content: 'some text eval(someVar)' }],
    }),
  ).toThrow();
});

test('rejects blocks with extra properties (strict mode)', () => {
  expect(() =>
    TemplateDefinitionSchema.parse({
      ...baseTemplate,
      blocks: [{ type: 'text', content: 'Hi', extraProp: 'forbidden' }],
    }),
  ).toThrow();
});

test('BUILTIN_TEMPLATES are deeply frozen', () => {
  const frozen = BUILTIN_TEMPLATES['ecuador-invoice-80-v1']!;
  expect(Object.isFrozen(frozen)).toBe(true);
  expect(Object.isFrozen(frozen.blocks)).toBe(true);
  for (const block of frozen.blocks) {
    expect(Object.isFrozen(block)).toBe(true);
  }
});

test('cannot mutate BUILTIN_TEMPLATES', () => {
  const frozen = BUILTIN_TEMPLATES['ecuador-invoice-80-v1']!;
  expect(() => {
    (frozen.blocks as unknown[]).push({ type: 'cut' });
  }).toThrow();
  expect(() => {
    (frozen as { id: string }).id = 'hacked';
  }).toThrow();
});
